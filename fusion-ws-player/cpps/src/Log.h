#ifndef WELLDONE_LOG_H
#define WELLDONE_LOG_H

#include <stdio.h>
#include <stdarg.h>
#include <time.h>
#include <sys/timeb.h>


class Log
{
public:
	Log();
	Log( char * tag);
	~Log();

	void enable(bool enable);
	void info(const char* format, ...);
	void warn(const char* format, ...);
	void error(const char* format, ...);
private:
	char* tag;

	bool enabled; //是否启用日志

	void log(const char* level, char* szBuffer, int &prefixLength);

};

#endif