#include "NewDecoder.h"

NewDecoder::NewDecoder()
{
	log = Log("C new Decoder");
	pPacket = av_packet_alloc();
	pFrame = av_frame_alloc();


	resetInsideParams();

	pVideoCodecContext = NULL;
	pAudioCodecContext = NULL;
	yuvBuffer = NULL;
	rgbBuffer = NULL;
	pSwsContext = NULL;
	 pixfmt=PIXFMT_YUV;

}
NewDecoder::~NewDecoder()
{
	close();
	if (pFrame != NULL) {
		av_frame_free(&pFrame);
		pFrame = NULL;
		log.info("frame released.");
	}
	if (pPacket != NULL) {
		av_packet_free(&pPacket);
		pPacket = NULL;
		log.info("packet released.");
	}
}
int NewDecoder::open(AVCodecID codecID, VideoCallback videoCallback,bool enableLog,Pixfmt expectPixfmt) {
	log.enable(enableLog);
	this->pixfmt=expectPixfmt;
	int ret;

	if (codecID != AV_CODEC_ID_H264 && codecID != AV_CODEC_ID_HEVC) {
		log.error("codecID is %d,but only support AV_CODEC_ID_H264 and AV_CODEC_ID_HEVC", codecID);
		return -1;
	}
	this->videoCallback = videoCallback;

	pVideoCodec = avcodec_find_decoder(codecID);
	if (!pVideoCodec) {
		log.error("Codec not found:%d", codecID);
		return -1;
	}

	pVideoCodecContext = avcodec_alloc_context3(pVideoCodec);
	if (!pVideoCodecContext) {
		log.error("Could not allocate video codec context");
		return -1;
	}
	/* For some codecs, such as msmpeg4 and mpeg4, width and height
	MUST be initialized there because this information is not
	available in the bitstream. */

	ret = avcodec_open2(pVideoCodecContext, pVideoCodec, NULL);
	if (ret < 0) {
		log.error("Could not open codec:ret=%d", ret);
		return -1;
	}

	//清空一下缓存
	avcodec_flush_buffers(pVideoCodecContext);
	log.info("codec open success.");
	return 0;
}

int NewDecoder::close() {

	resetInsideParams();

	//关闭解码器
	if (pVideoCodecContext != NULL) {
		avcodec_close(pVideoCodecContext);
		avcodec_free_context(&pVideoCodecContext);
		pVideoCodecContext = NULL;
		log.info("video decoder context released.");
	}

	if (pAudioCodecContext != NULL) {
		avcodec_close(pAudioCodecContext);
		avcodec_free_context(&pAudioCodecContext);
		pAudioCodecContext = NULL;
		log.info("audio decoder context released.");
	}

	if (yuvBuffer != NULL) {
		av_freep(&yuvBuffer);
		yuvBuffer = NULL;
		log.info("yuv buffer released.");
	}

	if (rgbBuffer != NULL) {
		av_freep(&rgbBuffer);
		rgbBuffer = NULL;
		log.info("rgb buffer released.");
	}

	return 0;
}
int NewDecoder::decodeVideo(unsigned char *data, int dataSize) {

	av_init_packet(pPacket);
	pPacket->data = data;
	pPacket->size = dataSize;
	
	handleVideoPacket(pPacket);

	//log.info("decodeVideo pPacket->buf==NULL? %d", pPacket->buf==NULL);
	av_packet_unref(pPacket);
	return 0;
}

//最耗时的就是解码和拷贝yuv数据这里，拷贝就大概花了七八十毫秒，而解码甚至能达到1秒
int NewDecoder::handleVideoPacket(AVPacket* packet) {
	int ret = 0;
	clock_t startTime, endTime;
	startTime = clock();


	int errorMsglen = 32;
	char errorMsg[errorMsglen];
	//log.info("send packet :packetSize=%d", packet->size);

	ret = avcodec_send_packet(pVideoCodecContext, packet);
	endTime = clock();
	log.info("avcodec_send_packet takes %d ms.the packet size is %d", (endTime - startTime) / 1000, packet->size);
	if (ret != 0) {
		av_strerror(ret, errorMsg, errorMsglen);
		log.error("send packet failed:ret=%d,msg=%s,packetSize=%d", ret, errorMsg, packet->size);
		return ret;
	}

	do {//一般情况下只会解出一帧，但也可能多帧，故放在循环中
		//startTime = clock();
		ret = avcodec_receive_frame(pVideoCodecContext, pFrame);
		//	log.info("avcodec_receive_frame:ret=%d", ret);
		if (ret != 0) {
			av_strerror(ret, errorMsg, errorMsglen);
			//log.error("avcodec_receive_frame failed:%d--%s", ret, errorMsg);
			break;
			//return -1;
		}
		//到这里已经成功解码出一帧了，此时可对解码数据进行缓存，或回调出去
		//endTime = clock();
		//log.info("avcodec_receive_frame takes %d ms.", (endTime - startTime) / 1000);

		if(this->pixfmt== PIXFMT_RGB){
			rgbCallback(pFrame);//回调rgb数据
		}else{
			yuvCallback(pFrame);//回调yuv数据
		}

	} while (ret == 0);//直至avcodec_receive_frame返回非0才退出

	if (!(pVideoCodecContext->pix_fmt == AV_PIX_FMT_YUV420P || pVideoCodecContext->pix_fmt == AV_PIX_FMT_YUVJ420P)) {
		log.warn("The PIX_FMT Not YUV420P!!! But is %d.", pVideoCodecContext->pix_fmt);
	}

	return 0;
}

int NewDecoder::yuvCallback(AVFrame* frame) {

	clock_t startTime, endTime;

	int firstFrame = 0;//是否是第一帧
	if (!hasDecodeVideoFrame) {
		firstFrame = 1;
		log.info("docode first video frame success.");
		hasDecodeVideoFrame = true;
		log.info("Video pix_fmt:%d resolution:%d*%d.",
			frame->format,
			frame->width,
			frame->height);
		//todo:这里表明解出第一帧，可以回调给用户
	}

	if (yuvBuffer == NULL) {
		oneYUVSize = av_image_get_buffer_size((AVPixelFormat)frame->format,
			frame->width,
			frame->height,
			1);
		log.info("one yuv buffer size=%d", oneYUVSize);
		yuvBufferSize = 2 * oneYUVSize;//一般只要比oneYUVSize大即可，这里设置为2倍
		yuvBuffer = (unsigned char *)av_mallocz(yuvBufferSize);
	}


	if (videoCallback) {
		startTime = clock();
		int ret = av_image_copy_to_buffer(yuvBuffer, yuvBufferSize,
			(const uint8_t * const *)frame->data,
			(const int *)frame->linesize, (AVPixelFormat)frame->format,
			frame->width, frame->height, 1);//返回值表示拷贝的数据大小
		endTime = clock();
		log.info("av_image_copy_to_buffer take %d ms", (endTime - startTime) / 1000);
		if (ret <= 0) {
			log.error("av_image_copy_to_buffer failed.");
			return -1;
		}

		videoCallback(yuvBuffer, oneYUVSize, firstFrame, frame->format, frame->width, frame->height, frame->pts);

	}

	return 0;
}

int NewDecoder::rgbCallback(AVFrame* frame) {

	clock_t startTime, endTime;

	int firstFrame = 0;//是否是第一帧
	if (!hasDecodeVideoFrame) {
		firstFrame = 1;
		log.info("docode first video frame success.");
		hasDecodeVideoFrame = true;
		log.info("Video pix_fmt:%d resolution:%d*%d.",
			frame->format,
			frame->width,
			frame->height);
		//todo:这里表明解出第一帧，可以回调通知给用户
	}

	if (pSwsContext == NULL) {
		pSwsContext = sws_getContext(
			//原图
			frame->width,
			frame->height,
			(AVPixelFormat)frame->format,
			//目标
			frame->width,
			frame->height,
			AV_PIX_FMT_RGB24,
			SWS_FAST_BILINEAR,//flags参数是原分辨率与目标分辨率不一致时使用哪种算法来调整
			NULL,
			NULL,
			NULL);

		rgbBufferSize = av_image_get_buffer_size(AV_PIX_FMT_RGB24,
			frame->width,
			frame->height,
			1);
		log.info("rbgBufferSize=%d", rgbBufferSize);
		rgbBuffer = (unsigned char *)av_mallocz(rgbBufferSize);

	}

	if (videoCallback) {
		startTime = clock();

		AVFrame *pRGBFrame = NULL;
		pRGBFrame = av_frame_alloc();

		av_image_fill_arrays(pRGBFrame->data, pRGBFrame->linesize, rgbBuffer, AV_PIX_FMT_BGR24, frame->width, frame->height, 1);
		int heightSlice = sws_scale(pSwsContext, frame->data, frame->linesize, 0, frame->height, pRGBFrame->data, pRGBFrame->linesize);
		endTime = clock();
		log.info("sws_scale take %d ms", (endTime - startTime) / 1000);

		videoCallback(rgbBuffer, rgbBufferSize, firstFrame, AV_PIX_FMT_RGB24, frame->width, frame->height, frame->pts);

		av_frame_free(&pRGBFrame);

	}

	return 0;

}

void NewDecoder::resetInsideParams()
{
	//只重置基本变量
	hasDecodeVideoFrame = false;

}
