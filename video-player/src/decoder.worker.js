//此版本将流下载整合进来

self.Module = {
    onRuntimeInitialized: function () {
        onWasmLoaded();
    }
};

self.importScripts("common.js");
self.importScripts("libffmpeg.js");

function Decoder() {
    this.tag = "Decoder2";
    this.logger = new Logger(this.tag);

    this.handle = 0;          //解码器句柄
    this.wasmLoaded = false;
    this.tmpReqQue = []; //主要是为了在wasm还没加载完毕时缓存一下已经发送的请求，待加载完毕之后就执行队列里的请求

    this.cacheBuffer = null;//缓存下载的一小块数据，大小为chunkSize，在关闭时记得销毁掉
    this.chunkSize = 32 * 1024;

    this.decodeTimer = null; //解码定时器
    this.videoCallback = 0;
    this.audioCallback = 0;
    this.requestCallback = 0;
    this.fetchController = null; //下载控制器，用于停止下载

    this.hasSendDataSize = 0;//记录已经发送的数据的大小
    this.waitSize = 512*1024 ;//在开始解码前等待的数据大小，即hasSendDataSize大于waitSize时才开始打开解码器
    this.tmpSign = false;//用于判断是否打开解码器的临时标记
    this.decodeInterval = 30;

}



//处理外部请求
Decoder.prototype.processReq = function (req) {

    this.logger.logInfo("处理收到的请求： " + JSON.stringify(req));

    switch (req.type) {
        case REQUEST_DECODE_OPEN://启动解码器
            this.openDecoder(req);
            break;
        case REQUEST_DECODE_CLOSE://关闭解码器
            this.closeDecoder();
            break;
        case REQUEST_DECODE_RELEASE://释放解码器
            this.releaseDecoder();
            break;

        default:
            this.logger.logError("Unsupport messsage " + req.t);
    }
};


Decoder.prototype.openDecoder = function (req) {
    let ret;
    if (req.logLevel) {
        ret = Module._setLogLevel(this.handle, req.logLevel);
    } else {
        ret = Module._setLogLevel(this.handle, 0);
    }


    //重置变量
    this._resetInsideParam();

    this.playUrl = req.playUrl;
    this.chunkSize = req.chunkSize;

    ret = this._initDecoder();

    if (ret == 0) {
        this.logger.logInfo("初始化解码器成功，开始下载流...");
        this._requestStream(this.playUrl);
    }

    var objData = {
        type: RESPOND_DECODE_OPEN,
        ret: ret
    };
    self.postMessage(objData);

    


}

Decoder.prototype.closeDecoder = function () {

    this._stoptDecodeTimer();

    //关闭下载
    if (this.fetchController != null) {
        this.fetchController.abort();
        this.fetchController == null;
        this.logger.logInfo("已中断流下载");
    };


    //关闭解码器
    let ret = Module._closeDecoder(this.handle);
    this.logger.logInfo("Close ffmpeg decoder return " + ret + ".");

    //关闭后释放内存
    this._uninitDecoder();

    this.logger.logInfo("解码器已关闭");

    //发送响应
    let objData = {
        type: RESPOND_DECODE_CLOSE,
        ret: ret
    };
    self.postMessage(objData);
}

Decoder.prototype.releaseDecoder = function () {
    let ret = Module._destroyDecoder();
    this.logger.logInfo("destroyDecoder return " + ret + ".");
    this.handle = 0;
    var objData = {
        type: RESPOND_DECODE_RELEASE,
        ret: ret
    };
    self.postMessage(objData);

    //销毁播放器之后关闭线程
    self.close();//关闭worker,节省资源
}




////////////////////////内部接口//////////////////////////////////

Decoder.prototype._notifyErrorMsg = function (data) {
    var objData = {
        type: EVENT_DECODE_ERROR,
        msg: data.msg,
        ret: data.ret
    };
    self.postMessage(objData);
}
//重置内部变量
Decoder.prototype._resetInsideParam = function () {
    this.hasSendDataSize = 0;
    this.tmpSign = false;
}
//创建解码器
Decoder.prototype._createDecoder = function () {
    let handle = Module._createDecoder();
    this.handle = handle;
    this.logger.logInfo("createDecoder return " + this.handle + ".");

    Module._setLogLevel(0);
};


//初始化解码器
Decoder.prototype._initDecoder = function () {
    var ret = Module._initDecoder(this.handle, this.videoCallback);
    this.logger.logInfo("initDecoder return " + ret + ".");
    if (0 == ret && this.cacheBuffer == null) {
        this.cacheBuffer = Module._malloc(this.chunkSize);
    }
    return ret;
};
//释放缓存
Decoder.prototype._uninitDecoder = function () {
    if (this.cacheBuffer != null) {
        Module._free(this.cacheBuffer);
        this.cacheBuffer = null;
    }
};

//打开解码器
Decoder.prototype._openDecoder = function () {
    let handle = this.handle;
  //  this.logger.logInfo("_openDecoder enter ");
    var ret = Module._openDecoder(handle);
    this.logger.logInfo("openDecoder return " + ret);
    if (ret == 0) {//打开成功后开始解码
        this._startDecodeTimer();
    } else {
        this._notifyErrorMsg({ msg: "打开解码器(_openDecoder)失败", ret: ret });

        //调用关闭
        this.closeDecoder();
    }

};


//开启解码定时器
Decoder.prototype._startDecodeTimer = function () {
    let interval = this.decodeInterval;
    if (this.decodeTimer) {
        clearInterval(this.decodeTimer);
    }

    this.decodeTimer = setInterval(this._decodeOnePacket, interval);
    this.logger.logInfo("已启动解码定时器");
};

Decoder.prototype._stoptDecodeTimer = function () {
    if (this.decodeTimer) {
        clearInterval(this.decodeTimer);
        this.decodeTimer = null;
        this.logger.logInfo("已停止解码定时器");
    }
};


//获取包数据并进行解码（单次），如果连续解码需连续调用
Decoder.prototype._decodeOnePacket = function () {

    //self.decoder.logger.logInfo("Start decodeOnePacket");
    //console.time('testForEach');
    var ret = Module._decodeOnePacket(self.decoder.handle);//返回0表示正常解出一帧，在回调函数中
    //console.timeEnd('testForEach');
    //self.decoder.logger.logInfo("decodeOnePacket take  "+(window.performance.now() - startTime)+" ms");

};


//处理发送数据请求
Decoder.prototype._sendData = function (dataBuffer) {
    let handle = this.handle;

    var typedArray = new Uint8Array(dataBuffer);
    Module.HEAPU8.set(typedArray, this.cacheBuffer);

    let receiveSize = Module._sendData(handle, this.cacheBuffer, typedArray.length);
    this.hasSendDataSize += receiveSize;
    //this.logger.logInfo("hasSendDataSize=" + this.hasSendDataSize);

};



//缓存请求
Decoder.prototype._cacheReq = function (req) {
    if (req) {
        this.tmpReqQue.push(req);
    }
};

Decoder.prototype._onWasmLoaded = function () {
    this.logger.logInfo("Wasm loaded.");
    this.wasmLoaded = true;

    this.videoCallback = Module.addFunction(function (buff, size, firstFrame, pixfmt, width, height, timestamp) {
        var outArray = Module.HEAPU8.subarray(buff, buff + size);
        var data = new Uint8Array(outArray);
        var objData = {
            type: kVideoFrame,
            timestamp: timestamp,
            data: data,
            size: size,
            firstFrame: firstFrame,
            pixfmt: pixfmt,
            width: width,
            height: height
        };
        self.postMessage(objData, [objData.data.buffer]);
    }, 'viiiiiij');

    this.audioCallback = Module.addFunction(function (buff, size, timestamp) {
        var outArray = Module.HEAPU8.subarray(buff, buff + size);
        var data = new Uint8Array(outArray);
        var objData = {
            t: kAudioFrame,
            s: timestamp,
            d: data
        };
        self.postMessage(objData, [objData.d.buffer]);
    }, 'viid');

    this.requestCallback = Module.addFunction(function (offset, availble) {
        var objData = {
            t: kRequestDataEvt,
            o: offset,
            a: availble
        };
        self.postMessage(objData);
    }, 'vii');

    this._createDecoder();

    while (this.tmpReqQue.length > 0) {
        var req = this.tmpReqQue.shift();
        this.processReq(req);
    }
};

//从网络下载流数据并发送
Decoder.prototype._requestStream = function (url) {
    var self = this;
    this.fetchController = new AbortController();
    const signal = this.fetchController.signal;//这个主要是为了中断下载

    this.logger.logInfo("开始下载：" + url);
    // fetch(url, { signal }).then(async function respond(response) {
     fetch(url, { signal }).then(function respond(response) {
        self.logger.logInfo("respond");
        const reader = response.body.getReader();//此时body是ReadableStream
        reader.read().then(function processData({ done, value }) {
            // self.logger.logInfo("done=" + done+",value len=" + value.byteLength);

            if (done) {
                self.logger.logInfo("Stream done.");

                return;
            }

            var dataLength = value.byteLength;
            var offset = 0;
            if (dataLength > self.chunkSize) {
                do {
                    let len = Math.min(self.chunkSize, dataLength);
                    var data = value.buffer.slice(offset, offset + len);
                    dataLength -= len;
                    offset += len;
                    self._sendData(data);

                } while (dataLength > 0);
            } else {
                self._sendData(value.buffer);
            }


            if (!self.tmpSign && self.hasSendDataSize >= self.waitSize) {//表示可以开始打开解码器了
                self.tmpSign = true;
                self.logger.logInfo("开始打开解码器...");
                self._openDecoder();
            }

            return reader.read().then(processData);
        });
    }).catch(err => {
        console.log("下载被中断：" + err.message);
    });
};



self.decoder = new Decoder;

self.onmessage = function (evt) {
    if (!self.decoder) {
        console.log("[ER] Decoder not initialized!");
        return;
    }

    var req = evt.data;
    if (!self.decoder.wasmLoaded) {
        self.decoder._cacheReq(req);
        self.decoder.logger.logInfo("Temp cache req " + req.type + ".");
        return;
    }

    self.decoder.processReq(req);
};

function onWasmLoaded() {
    if (self.decoder) {
        self.decoder._onWasmLoaded();
    } else {
        console.log("[ER] No decoder!");
    }
}


