#ifndef WELLDONE_NEW_PLAYER_H
#define WELLDONE_NEW_PLAYER_H

//此版与Player.cpp不同的是整合了解码器并修改了解码器部分逻辑

//回调给应用层
//buff 解码后数据
//size 解码后数据大小
//first 是否是第一帧
//pixfmt 像素格式
//width 图像宽
//height 图像高
//timestamp 时间戳
typedef void(*VideoCallback)(unsigned char *buff, int size, int first, int pixfmt, int width, int height, long int timestamp);

extern "C" {
#include "libavcodec/avcodec.h"
#include "libavformat/avformat.h"
#include "libavutil/fifo.h"
#include "libavutil/imgutils.h"
#include "libswscale/swscale.h"
}

#include "Log.h"

enum State {
	STATELESS = 0, //无状态，表示未做任何操作
	STATE_INIT,    //已初始化
	STATE_OPEN,    //已经打开
	STATE_CLOSE    //已经关闭

};

enum LogLevel {
	LOG_LEVEL_NONE = 0, //不输出任何日志
	LOG_LEVEL_CORE,    //本身日志，不包含ffmpeg
	LOG_LEVEL_ALL    //所有日志，包含ffmpeg


};

enum Pixfmt {
	PIXFMT_YUV = 0, //回调ｙｕｖ数据
	PIXFMT_RGB,    //回调ｒｇｂ数据
	
};

#define MIN(X, Y)  ((X) < (Y) ? (X) : (Y))
#define CUSTOMIO_BUFFER_SIZE  (32 * 1024) //自定义IO
#define DEFAULT_FIFOBUFFER_SIZE  (1 * 1024 * 1024) //默认的环形缓存队列的大小
#define MAX_FIFOBUFFER_SIZE (16 * 1024 * 1024) //最大的环形缓存队列的大小
#define GROW_FIFOBUFFER_SIZE (2 * 1024 * 1024) //当缓存队列大小不够时的扩容大小


class NewPlayer
{
public:
	//todo：接口重复调用的问题，关闭后数据的销毁，重新打开后数据的初始化等问题待解决

	NewPlayer();

	~NewPlayer();

	//设置输出日志级别
	int setLogLevel(LogLevel level);

	//解码前准备
	int init(VideoCallback videoCallback,Pixfmt pixfmt=PIXFMT_YUV);

	//在调用打开之前要确保已经传送了部分数据
	int open();

	//关闭解码器,在调用此之前请确保receiveData和decodeOnePacket接口已经停止调用，否则有可能出错
	int close();

	//接收web端传送的数据，如果接收数据超过了一定数值但发现解码器仍然未打开，则直接丢弃旧的数据
	//返回已接收的大小
	int receiveData(unsigned char *buff, int size);

	//获取数据并解码
	int decodeOnePacket();


	//内部使用，外部勿用
	//自定义IO读取数据
	//[out]buf: 将要读取的数据存储在此
	//[out]buf_size: 希望读取的数据大小
	//return 实际读取到的数据大小，即buf的实际大小
	int read_packet(uint8_t *buf, int buf_size);

private:


	//const int CUSTOMIO_BUFFER_SIZE = 32 * 1024; //自定义IO
	//const int DEFAULT_FIFOBUFFER_SIZE = 1 * 1024 * 1024; //默认的环形缓存队列的大小
	//const int MAX_FIFOBUFFER_SIZE = 16 * 1024 * 1024; //最大的环形缓存队列的大小
	//const int GROW_FIFOBUFFER_SIZE = 2 * 1024 * 1024; //当缓存队列大小不够时的扩容大小


	State currentState;//当前状态
	LogLevel logLevel;//日志级别
	Log log;//记录日志

	

	unsigned char *customIoBuffer; //自定义io缓存，大小为CUSTOMIO_BUFFER_SIZE，用完记得释放内存
	AVFifoBuffer *pFifoBuffer;//环形缓存队列，用于存放web传送过来的数据，用完记得释放内存
	int fifoBufferSize; //环形缓存队列的大小

	
	
	int oneYUVSize;//一帧图像（yuv）的大小
	unsigned char *yuvBuffer;//用来存放yuv的缓存（一般会比oneYUVSize大），用完记得释放内存
	int yuvBufferSize;//yuvBuffer的大小

	unsigned char *rgbBuffer;//用来存放yuv的缓存（一般会比oneYUVSize大），用完记得释放内存
	int rgbBufferSize;

	AVFormatContext * pFormatContext;
	AVCodecContext *pVideoCodecContext;
	AVCodecContext *pAudioCodecContext;
	AVIOContext* pIOContext;
	SwsContext * pSwsContext;

	AVPacket * packet;//待解码包
	AVFrame* frame;//解码帧

	int videoStreamIdx; //视频流下标
	int audioStreamIdx; //音频流下标
	AVCodecID videoCodecID;//视频解码id
	AVCodecID audioCodecID;//音频解码id
	VideoCallback videoCallback;//解码数据回调
	Pixfmt pixfmt;//解码后的数据格式
	

	bool hasAudioStream;//流中是否带有音频数据
	bool audioAvailable;//音频是否可用（不可用有可能是接口出错或解码id不支持等）

	bool hasDecodeVideoFrame;//是否已经解码出第一帧视频，默认false,重新打开需重置
	bool hasDecodeAudioFrame;//是否已经解码出第一帧音频，默认false,重新打开需重置


	//将相关参数恢复默认值
	void resetInsideParams();

	//处理视频包，内部对其进行解码后回调
	int handleVideoPacket(AVPacket* packet);

	//回调yuv数据
	int yuvCallback(AVFrame* frame);

	//回调rgb数据，内部会将yuv数据转为rgb
	int rgbCallback(AVFrame* frame);

	//修改当前状态
	void changeState(State state);

	//打开解码器
	int openVideoDecoder();

	int openAudioDecoder();

};

#endif