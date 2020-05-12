#include "NewPlayer.h"

//ffmpeg内部日志的回调，这个对于开发阶段非常有用
static void ffmpegLogCallback(void* ptr, int level, const char* fmt, va_list vl) {
	static int printPrefix = 1;
	static int count = 0;
	static char prev[1024] = { 0 };
	char line[1024] = { 0 };
	static int is_atty;
	AVClass* avc = ptr ? *(AVClass**)ptr : NULL;
	if (level > AV_LOG_DEBUG) {
		return; 
	}

	line[0] = 0;

	if (printPrefix && avc) {
		if (avc->parent_log_context_offset) {
			AVClass** parent = *(AVClass***)(((uint8_t*)ptr) + avc->parent_log_context_offset);
			if (parent && *parent) {
				snprintf(line, sizeof(line), "[%s @ %p] ", (*parent)->item_name(parent), parent);
			}
		}
		snprintf(line + strlen(line), sizeof(line) - strlen(line), "[%s @ %p] ", avc->item_name(ptr), ptr);
	}

	vsnprintf(line + strlen(line), sizeof(line) - strlen(line), fmt, vl);
	line[strlen(line) + 1] = 0;

	printf("%s\n", line);
}

//自定义IO读取数据
static int read_packet_cb(void *opaque, uint8_t *buf, int buf_size) {
	NewPlayer * player = (NewPlayer*)opaque;
	return player->read_packet(buf, buf_size);
}



NewPlayer::NewPlayer()
{


	log = Log("C Player");
	setLogLevel(LOG_LEVEL_NONE);//默认不输入日志

	changeState(STATELESS);

	packet = av_packet_alloc();
	frame = av_frame_alloc();

	fifoBufferSize = DEFAULT_FIFOBUFFER_SIZE;
	pFifoBuffer = av_fifo_alloc(fifoBufferSize);

	resetInsideParams();
	pIOContext = NULL;
	pFormatContext = NULL;
	pVideoCodecContext = NULL;
	pAudioCodecContext = NULL;
	pSwsContext = NULL;

	customIoBuffer = NULL;
	rgbBuffer = NULL;
	yuvBuffer = NULL;
	pixfmt = PIXFMT_YUV;

}
NewPlayer::~NewPlayer()
{
	close();

	if (frame != NULL) {
		av_frame_free(&frame);
		frame = NULL;
		log.info("frame released.");
	}
	if (packet != NULL) {
		av_packet_free(&packet);
		packet = NULL;
		log.info("packet released.");
	}

	if (pFifoBuffer != NULL) {
		av_fifo_free(pFifoBuffer);
		pFifoBuffer = NULL;
		log.info("fifo buffer released.");
	}

}
int NewPlayer::setLogLevel(LogLevel level)
{
	this->logLevel = level;
	log.enable(level == LOG_LEVEL_NONE ? false : true);

	if (level == LOG_LEVEL_ALL) {
		av_log_set_callback(ffmpegLogCallback);
		//av_log_set_callback(av_log_default_callback);

	}

	return 0;
}
void NewPlayer::resetInsideParams()
{
	//只重置基本变量

	hasAudioStream = false;
	audioAvailable = false;

	hasDecodeVideoFrame = false;
	hasDecodeAudioFrame = false;

}



int NewPlayer::init(VideoCallback videoCallback,Pixfmt pixfmt)
{
	this->videoCallback = videoCallback;
	this->pixfmt= pixfmt;
	changeState(STATE_INIT);
	return 0;
}

int NewPlayer::read_packet(uint8_t *buf, int buf_size) {

	//log.info("read_packet %d.", buf_size);
	if (buf == NULL || buf_size <= 0) {
		return AVERROR_INVALIDDATA;
	}

	int32_t ret = AVERROR_EOF;
	int availableBytes = 0;//获得可读字节数
	int canReadLen = 0;//实际上读取的字节数
	do {
		availableBytes = av_fifo_size(pFifoBuffer);
		if (availableBytes <= 0) {
			break;
		}
		//log.info("before av_fifo_generic_read av_fifo_size=%d",av_fifo_size(pFifoBuffer));
		canReadLen = MIN(availableBytes, buf_size);
		av_fifo_generic_read(pFifoBuffer, buf, canReadLen, NULL);

		//log.info("av_fifo_generic_read canReadLen=%d,av_fifo_size=%d", canReadLen, av_fifo_size(pFifoBuffer));
		ret = canReadLen;
	} while (0);

	return ret;
}

int NewPlayer::open()
{
	if (currentState == STATELESS) {
		log.warn("please call init frist");
		return -1;
	}
	if (currentState == STATE_OPEN) {
		log.warn("has open!!! do not open again , or reopen after closing");
		return 0;
	}

	int ret = 0;

	log.info("avformat_alloc_context.");
	pFormatContext = avformat_alloc_context();

	customIoBuffer = (unsigned char*)av_mallocz(CUSTOMIO_BUFFER_SIZE); //记得释放
	log.info("avio_alloc_context.");
	pIOContext = avio_alloc_context(
		customIoBuffer,
		CUSTOMIO_BUFFER_SIZE,
		0,
		this,
		read_packet_cb,
		NULL,
		NULL);

	if (pIOContext == NULL) {
		log.error("avio_alloc_context failed.");
		return -1;
	}

	pFormatContext->pb = pIOContext;
	pFormatContext->flags = AVFMT_FLAG_CUSTOM_IO;

	//探测流格式
	AVInputFormat *pInputFormat = NULL;
	ret = av_probe_input_buffer(pIOContext, &pInputFormat, "", NULL, 0, 0);
	if (ret < 0) {
		char err_info[32] = { 0 };
		av_strerror(ret, err_info, 32);
		log.error("av_probe_input_buffer failed %d %s.", ret, err_info);
		return -1;
	}
	log.info("av_probe_input_buffer success.");

	log.info("avformat_open_input...");
	ret = avformat_open_input(&pFormatContext, NULL, pInputFormat, NULL);
	if (ret != 0) {
		char err_info[32] = { 0 };
		av_strerror(ret, err_info, 32);
		log.error("avformat_open_input failed %d %s.", ret, err_info);
		return -1;
	}
	log.info("avformat_open_input success.");

	ret = avformat_find_stream_info(pFormatContext, NULL);
	if (ret < 0) {
		log.error("av_find_stream_info failed %d.", ret);
		return -1;
	}
	log.info("avformat_find_stream_info success.");


	ret = openVideoDecoder();
	if (ret != 0) {
		log.error("openVideoDecoder failed");
		return -1;
	}

	//音频失败仍能继续下去
	ret = openAudioDecoder();
	if (ret != 0) {
		log.error("openAudioDecoder failed");
	}

	changeState(STATE_OPEN);
	return 0;
}



int NewPlayer::close()
{
	changeState(STATE_CLOSE);

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

	if (pIOContext != NULL) {
		av_free(pIOContext->buffer);
		customIoBuffer = NULL;
		avio_context_free(&pIOContext);
		pIOContext = NULL;
		log.info("IO context released.");
	}

	if (pFormatContext != NULL) {
		avformat_close_input(&pFormatContext);
		pFormatContext = NULL;
		log.info("format context released.");
	}
	if (pSwsContext != NULL) {
		sws_freeContext(pSwsContext);
		pSwsContext = NULL;
		log.info("pSwsContext released.");
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
	if (pFifoBuffer != NULL) {
		av_fifo_free(pFifoBuffer);
		pFifoBuffer = NULL;
		log.info("fifo buffer has reset.");
	}


	return 0;
}

int NewPlayer::receiveData(unsigned char * buff, int size)
{
	if (!(currentState == STATE_INIT|| currentState == STATE_OPEN)) {
		log.error("has not init or open ,drop data");
		return -1;
	}
	if (buff == NULL || size == 0) {
		return 0;
	}

	//log.info("enter receiveData");

	if (pFifoBuffer == NULL) {
		//初始化fifo
		fifoBufferSize = DEFAULT_FIFOBUFFER_SIZE;
		pFifoBuffer = av_fifo_alloc(fifoBufferSize);
	}

	int ret = 0;

	int64_t leftSpace = av_fifo_space(pFifoBuffer);//剩余空间
	if (leftSpace < size) {
		int growSize = 0;
		do {
			leftSpace += GROW_FIFOBUFFER_SIZE;
			growSize += GROW_FIFOBUFFER_SIZE;
		} while (leftSpace < size);

		int oldFifoBufferSize = fifoBufferSize;
		av_fifo_grow(pFifoBuffer, growSize);//实际增加的可能会比请求的多
		fifoBufferSize = av_fifo_size(pFifoBuffer) + av_fifo_space(pFifoBuffer);

		log.warn("fifo buffer size has grow %d,now totol size is %d", (fifoBufferSize - oldFifoBufferSize), fifoBufferSize);


	}

	ret = av_fifo_generic_write(pFifoBuffer, buff, size, NULL);

	if (fifoBufferSize >= MAX_FIFOBUFFER_SIZE) {//todo:fifoBufferSize不能无限增长下去，如果太大了说明滞留了很多数据，应该有策略去丢掉一些数据
	//	log.warn("Fifo buffer size larger than %d,you need to care!!!", MAX_FIFOBUFFER_SIZE);
	}

	return ret;
}

int NewPlayer::decodeOnePacket()
{
	
	if (currentState != STATE_OPEN) {
		log.error("has not open,can not decode");
		return -1;
	}
	//clock_t startTime, endTime;//1秒clock1000000,相当于1ms=1000
	//startTime = clock();
	int ret = 0;

	int canReadLen = av_fifo_size(pFifoBuffer);
	//log.info("fifo buffer canReadLen=%d", canReadLen);
	if (canReadLen>MAX_FIFOBUFFER_SIZE) {
		log.warn("fifo buffer av_fifo_size=%d  is too larger,you need to care.the fifo buffer size now is %d", canReadLen, fifoBufferSize);

	}

	if (canReadLen <= 0) {
		log.info("fifo buffer has no data to read ,can not decode");
		return -1;
	}


	av_init_packet(packet);
	packet->data = NULL;
	packet->size = 0;

	do {
		ret = av_read_frame(pFormatContext, packet);
		if (ret == AVERROR_EOF) {
			//表明流结束了，因此需要发送空包清空解码器缓存，否则会导致尾帧无法被解码
			packet->data = NULL;
			packet->size = 0;
		}
		else if (ret<0) {
			char err_info[32] = { 0 };
			av_strerror(ret, err_info, 32);
			log.error("av_read_frame  failed:ret=%d,msg= %s.", ret, err_info);
			break;
		}

		if (packet->stream_index == videoStreamIdx) {//表示视频流
													 //log.info("video stream");
			ret = handleVideoPacket(packet);
		}
		if (packet->stream_index == audioStreamIdx) {//表示音频流
													 //log.info("audio stream");
													 //	ret= handleAudioPacket(&packet);
		}

	} while (0);

	av_packet_unref(packet);

	//endTime = clock();
	//log.info("decodeOnePacket take %d ms", (endTime - startTime) / 1000);
	return ret;
}

//最耗时的就是解码和拷贝yuv数据这里，拷贝就大概花了七八十毫秒，而解码甚至能达到1秒
int NewPlayer::handleVideoPacket(AVPacket* packet) {
	int ret = 0;
	clock_t startTime, endTime;
	startTime = clock();


	int errorMsglen = 32;
	char errorMsg[errorMsglen];
	//log.info("send packet :packetSize=%d", packet->size);

	ret = avcodec_send_packet(pVideoCodecContext, packet);
	endTime = clock();
	log.info("avcodec_send_packet takes %d ms.", (endTime - startTime) / 1000);
	if (ret != 0) {
		av_strerror(ret, errorMsg, errorMsglen);
		log.error("send packet failed:ret=%d,msg=%s,packetSize=%d", ret, errorMsg, packet->size);
		return ret;
	}

	do {//一般情况下只会解出一帧，但也可能多帧，故放在循环中
		startTime = clock();
		ret = avcodec_receive_frame(pVideoCodecContext, frame);
		//	log.info("avcodec_receive_frame:ret=%d", ret);
		if (ret != 0) {
			av_strerror(ret, errorMsg, errorMsglen);
			log.error("avcodec_receive_frame failed:%d--%s", ret, errorMsg);
			break;
			//return -1;
		}
		//到这里已经成功解码出一帧了，此时可对解码数据进行缓存，或回调出去
		endTime = clock();
		log.info("avcodec_receive_frame takes %d ms.", (endTime - startTime) / 1000);
		
		if(this->pixfmt== PIXFMT_RGB){
			rgbCallback(frame);//回调rgb数据
		}else{
			yuvCallback(frame);//回调yuv数据
		}
		
		

	} while (ret==0);//直至avcodec_receive_frame返回非0才退出

	
	//endTime = clock();
	//log.info("docode takes %d ms.", (endTime - startTime) / 1000);

	if (!(pVideoCodecContext->pix_fmt == AV_PIX_FMT_YUV420P || pVideoCodecContext->pix_fmt == AV_PIX_FMT_YUVJ420P)) {
		log.warn("The PIX_FMT Not YUV420P!!! But is %d.", pVideoCodecContext->pix_fmt);
	}

	return 0;
}

int NewPlayer::yuvCallback(AVFrame* frame) {

	clock_t startTime, endTime;

	int firstFrame = 0;//是否是第一帧
	if (!hasDecodeVideoFrame) {
		firstFrame = 1;
		log.info("docode first video frame success.");
		hasDecodeVideoFrame = true;
		log.info("Video stream index:%d pix_fmt:%d resolution:%d*%d.",
			videoStreamIdx,
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

		//得到这一帧在整个视频中的时间戳，单位秒
		double timestamp = (double)frame->pts * av_q2d(pFormatContext->streams[videoStreamIdx]->time_base);
		int64_t timestampMS = timestamp * 1000;
		//log.info("timestamp=%lf,timestampMS= %ld , oneYUVSize= %d ", timestamp, timestampMS, oneYUVSize);

		//startTime = clock();
		videoCallback(yuvBuffer, oneYUVSize, firstFrame, frame->format, frame->width, frame->height, timestampMS);
		//endTime = clock();
		//log.info("videoCallback take %d ms", (endTime - startTime) / 1000);//经测试此回调不耗时

	}

	return 0;
}

int NewPlayer::rgbCallback(AVFrame* frame) {

	clock_t startTime, endTime;

	int firstFrame = 0;//是否是第一帧
	if (!hasDecodeVideoFrame) {
		firstFrame = 1;
		log.info("docode first video frame success.");
		hasDecodeVideoFrame = true;
		log.info("Video stream index:%d pix_fmt:%d resolution:%d*%d.",
			videoStreamIdx,
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

		//得到这一帧在整个视频中的时间戳，单位秒
		double timestamp = (double)frame->pts * av_q2d(pFormatContext->streams[videoStreamIdx]->time_base);
		int64_t timestampMS = timestamp * 1000;
		//log.info("timestamp=%lf,timestampMS= %ld , oneYUVSize= %d ", timestamp, timestampMS, oneYUVSize);

		videoCallback(rgbBuffer, rgbBufferSize, firstFrame, AV_PIX_FMT_RGB24, frame->width, frame->height, timestampMS);

		av_frame_free(&pRGBFrame);


	}

	return 0;

}

void NewPlayer::changeState(State state)
{
	currentState = state;
}

int NewPlayer::openVideoDecoder()
{

	int ret = 0;

	//获得视频流下标
	ret = av_find_best_stream(pFormatContext, AVMEDIA_TYPE_VIDEO, -1, -1, NULL, 0);
	if (ret < 0) {
		log.error("Could not find %s stream.", av_get_media_type_string(AVMEDIA_TYPE_VIDEO));
		return -1;
	}
	videoStreamIdx = ret;

	AVStream *st = pFormatContext->streams[videoStreamIdx];
	videoCodecID = st->codecpar->codec_id;
	AVCodecParameters *pCodecParameters = st->codecpar;


	AVCodec * pCodec = avcodec_find_decoder(videoCodecID);
	if (pCodec == NULL) {
		log.error("avcodec_find_decoder failed:codecID=%d", videoCodecID);
		return -1;
	}
	log.info("find decoder: name=%s AVCodecID=%d", pCodec->name, pCodec->id);
	pVideoCodecContext = avcodec_alloc_context3(pCodec);
	if (pVideoCodecContext == NULL) {
		log.error("avcodec_alloc_context3 failed");
		return -1;
	}
	if (pCodecParameters != NULL) {
		int ret = avcodec_parameters_to_context(pVideoCodecContext, pCodecParameters);
		if (ret < 0) {
			log.error("Failed to copy  codec parameters to decoder context.this may lead to decode failed .");
		}
	}

	//开启多线程（根据cpu核数）,由于wasm不支持多线程，因此不要设置这个，否则导致解码失败
	//pVideoCodecContext->thread_count = av_cpu_count();

	log.info("the thread count=%d,av_cpu_count=%d", pVideoCodecContext->thread_count, av_cpu_count());

	ret = avcodec_open2(pVideoCodecContext, pCodec, NULL);
	if (ret != 0) {

		char err_info[32] = { 0 };
		av_strerror(ret, err_info, 32);
		log.error("avcodec_open2  failed %d %s.", ret, err_info);
		return -1;
	}
	
	//清空一下缓存
	avcodec_flush_buffers(pVideoCodecContext);

	log.info("avcodec_open2 video success .");
	return 0;
}
int NewPlayer::openAudioDecoder()
{
	//todo:音频代码未完善

	int ret = 0;
	hasAudioStream = false;
	audioAvailable = false;

	//获得音频流下标
	ret = av_find_best_stream(pFormatContext, AVMEDIA_TYPE_AUDIO, -1, -1, NULL, 0);
	if (ret < 0) {
		log.error("Could not find %s stream.", av_get_media_type_string(AVMEDIA_TYPE_AUDIO));
		
		return -1;
	}
	hasAudioStream = true;
	audioStreamIdx = ret;

	AVStream *st = pFormatContext->streams[audioStreamIdx];
	audioCodecID = st->codecpar->codec_id;
	AVCodecParameters *pCodecParameters = st->codecpar;

	AVCodec * pCodec = avcodec_find_decoder(audioCodecID);
	if (pCodec == NULL) {
		log.error("avcodec_find_decoder failed:codecID=%d", audioCodecID);
		return -1;
	}
	log.info("find decoder: name=%s AVCodecID=%d", pCodec->name, pCodec->id);
	pAudioCodecContext = avcodec_alloc_context3(pCodec);
	if (pAudioCodecContext == NULL) {
		log.error("avcodec_alloc_context3 failed");
		return -1;
	}
	if (pCodecParameters != NULL) {
		int ret = avcodec_parameters_to_context(pAudioCodecContext, pCodecParameters);
		if (ret < 0) {
			log.error("Failed to copy  codec parameters to decoder context.this may lead to decode failed .");
		}
	}

	//开启多线程（根据cpu核数）,由于wasm不支持多线程，因此不要设置这个，否则导致解码失败
	//pVideoCodecContext->thread_count = av_cpu_count();

	log.info("the thread count=%d,av_cpu_count=%d", pAudioCodecContext->thread_count, av_cpu_count());

	ret = avcodec_open2(pAudioCodecContext, pCodec, NULL);
	if (ret != 0) {

		char err_info[32] = { 0 };
		av_strerror(ret, err_info, 32);
		log.error("avcodec_open2  failed %d %s.", ret, err_info);
		return -1;
	}

	//清空一下缓存
	avcodec_flush_buffers(pAudioCodecContext);

	audioAvailable = true;
	log.info("Audio stream index:%d sample_fmt:%d channel:%d, sample rate:%d.",
		audioStreamIdx,
		pAudioCodecContext->sample_fmt,
		pAudioCodecContext->channels,
		pAudioCodecContext->sample_rate);
	enum AVSampleFormat sampleFmt = pAudioCodecContext->sample_fmt;
	if (av_sample_fmt_is_planar(sampleFmt)) {
		const char *packed = av_get_sample_fmt_name(sampleFmt);//
		sampleFmt = av_get_packed_sample_fmt(sampleFmt);//返回对应的packed类型
	}

	log.info("avcodec_open2 audio success .");
	return 0;
}