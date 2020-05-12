#include <stdio.h>
//#include "Log.h"
#include "NewDecoder.h"
//接口原则
//支持多路播放器
//由于无法使用线程，因此耗时操作需暴露接口由web进行线程处理（解码是耗时操作，需要交给web）
//由于无法使用socket,数据需要通过web获取
#ifdef __cplusplus
extern "C" {
#endif

//创建解码器
//返回句柄
long  createDecoder() {
	NewDecoder* player = new NewDecoder();
	return (long)player;
}


//打开解码器
int openDecoder(long handle,int codecID,long videoCallback,bool enableLog=false,int expectPixfmt = 0) {
	if (handle == 0) {
		return -1;
	}
	NewDecoder* player = (NewDecoder*)handle;
	return player->open((AVCodecID)codecID,(VideoCallback)videoCallback,enableLog,(Pixfmt)expectPixfmt);
}


//关闭解码器
int closeDecoder(long handle) {
	if (handle == 0) {
		return -1;
	}
	NewDecoder* player = (NewDecoder*)handle;
	return player->close();

}
// 浏览器下载数据后将数据发送给ffmpeg
int decodeVideo(long handle, unsigned char *buff, int size) {
	if (handle == 0) {
		return -1;
	}
	NewDecoder* player = (NewDecoder*)handle;
	return player->decodeVideo(buff, size);

}


//销毁解码器，在解码器不用时记得及时销毁掉，否则会导致内存泄漏
int destroyDecoder(long handle) {
	if (handle == 0) {
		return -1;
	}
	NewDecoder* player = (NewDecoder*)handle;
	delete player;
	return 0;
}

int main()
{
	//Log log = Log("abc");
	//log.info("dd");
	//log.enable(false);
	//log.info("this is a=%d %s", 123, "hello");
	//log.error("this is a=%d %s", 123, "hello");
	//printf("hello from ffmpeg_decode!\n");
	//getchar();


	return 0;
}


#ifdef __cplusplus
}
#endif
