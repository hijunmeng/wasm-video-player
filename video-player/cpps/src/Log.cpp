#include "Log.h"


Log::Log()
{
	Log("notag");

}
Log::Log( char* tag)
{
	enabled = true;
	if (tag) {
		this->tag = tag;
	}
	else {
		this->tag = "notag";
	}
	
}


Log::~Log()
{
}

void Log::enable(bool enable)
{
	this->enabled = enable;
}

//日志输出，最多1024个字节
void Log::info(const char* format, ...) {
	if (!enabled) {
		return;
	}

	char *p = NULL;
	char szBuffer[1024] = { 0 };
	int prefixLength = 0;

	log("info", szBuffer,  prefixLength);
	p = szBuffer + prefixLength;
	va_list ap;
	va_start(ap, format);
	vsnprintf(p, 1024 - prefixLength, format, ap);
	va_end(ap);
	printf("%s\n", szBuffer);
}

void Log::warn(const char* format, ...) {
	if (!enabled) {
		return;
	}
	char *p = NULL;
	char szBuffer[1024] = { 0 };
	int prefixLength = 0;

	log("warn", szBuffer, prefixLength);
	p = szBuffer + prefixLength;
	va_list ap;
	va_start(ap, format);
	vsnprintf(p, 1024 - prefixLength, format, ap);
	va_end(ap);
	printf("%s\n", szBuffer);
}

void Log::error(const char* format, ...) {
	
	if (!enabled) {
		return;
	}
	char *p = NULL;
	char szBuffer[1024] = { 0 };
	int prefixLength = 0;

	log("error", szBuffer, prefixLength);
	p = szBuffer + prefixLength;
	va_list ap;
	va_start(ap, format);
	vsnprintf(p, 1024 - prefixLength, format, ap);
	va_end(ap);
	printf("%s\n", szBuffer);

}

void Log::log(const char* level,char* szBuffer,int &prefixLength) {

	char szTime[32] = { 0 };
	struct tm tmTime;
	struct timeb tb;

	ftime(&tb);
	localtime_r(&tb.time, &tmTime);


	int tmYear = tmTime.tm_year + 1900;
	int tmMon = tmTime.tm_mon + 1;
	int tmMday = tmTime.tm_mday;
	int tmHour = tmTime.tm_hour;
	int tmMin = tmTime.tm_min;
	int tmSec = tmTime.tm_sec;
	int tmMillisec = tb.millitm;
	sprintf(szTime, "%d-%d-%d %d:%d:%d.%d", tmYear, tmMon, tmMday, tmHour, tmMin, tmSec, tmMillisec);


	prefixLength = sprintf(szBuffer, "[%s][%s][%s] ", szTime, tag, level);
	//p = szBuffer + prefixLength;

}