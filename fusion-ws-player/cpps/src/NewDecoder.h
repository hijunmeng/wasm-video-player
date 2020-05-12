#ifndef WELLDONE_NEW_DECODER_H
#define WELLDONE_NEW_DECODER_H

///此解码器只接收裸流数据

extern "C" {
#include "libavcodec/avcodec.h"
#include "libavutil/imgutils.h"
#include "libswscale/swscale.h"
}
#include "Log.h"
//回调给应用层
//buff 解码后数据
//size 解码后数据大小
//first 是否是第一帧
//pixfmt 像素格式
//width 图像宽
//height 图像高
//timestamp 时间戳
typedef void(*VideoCallback)(unsigned char *buff, int size, int first, int pixfmt, int width, int height, long int timestamp);
enum Pixfmt {
	PIXFMT_YUV = 0, //回调ｙｕｖ数据
	PIXFMT_RGB,    //回调ｒｇｂ数据
	
};

class NewDecoder
{
public:
	NewDecoder();
	~NewDecoder();

	//打开解码器
	int open(AVCodecID codecID, VideoCallback videoCallback,bool enableLog=false,Pixfmt expectPixfmt=PIXFMT_YUV);

	//关闭解码器
	int close();

	//解码，数据请在回调中接收
	int decodeVideo(unsigned char *data, int dataSize);

	
private:
	Log log;//记录日志
	const AVCodec *pVideoCodec;
	AVCodecContext *pAudioCodecContext;
	AVCodecContext *pVideoCodecContext;
	AVFrame *pFrame;
	AVPacket *pPacket;



	bool hasDecodeVideoFrame;//是否已经解码出第一帧视频，默认false,重新打开需重置
	VideoCallback videoCallback;//解码数据回调
	Pixfmt pixfmt;//解码后的数据格式

	int oneYUVSize;//一帧图像（yuv）的大小
	unsigned char *yuvBuffer;//用来存放yuv的缓存（一般会比oneYUVSize大），用完记得释放内存
	int yuvBufferSize;//yuvBuffer的大小
	unsigned char *rgbBuffer;
	int rgbBufferSize;

	SwsContext * pSwsContext;

	int handleVideoPacket(AVPacket* packet);
	int yuvCallback(AVFrame* frame);
	int rgbCallback(AVFrame* frame);
	void resetInsideParams();
};

#endif