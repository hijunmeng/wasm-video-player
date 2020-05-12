self.Module = {
    onRuntimeInitialized: function () {
        onWasmLoaded();
    }
};

self.importScripts("common.js");
self.importScripts("libffmpeg.js");

function Decoder() {
    this.tag = "Decoder Worker";
    this.logger = new Logger(this.tag);

    this.handle = 0;          //解码器句柄
    this.wasmLoaded = false;
    this.tmpReqQue = []; //主要是为了在wasm还没加载完毕时缓存一下已经发送的请求，待加载完毕之后就执行队列里的请求

    this.cacheSize = 512 * 1024;//cacheSize必须比裸流中的每一帧的最大值还要大，一般512KB是足够了
    this.cacheBuffer=null;//用于存储裸流，大小为cacheSize

    this.videoCallback = 0;

}

//处理外部请求
Decoder.prototype.processReq = function (req) {

    if(req.type!=REQUEST_SEND_STREAM){
        this.logger.logInfo("处理收到的请求： " + JSON.stringify(req));
    }
    

    switch (req.type) {
        case REQUEST_DECODE_OPEN://启动解码器
            this.openDecoder(req);
            break;
        case REQUEST_DECODE_CLOSE://关闭解码器
            this.closeDecoder();
            break;
        case REQUEST_SEND_STREAM://发送裸流
            this.sendStream(req);
            break;
        case REQUEST_DECODE_RELEASE://释放解码器
            this.releaseDecoder();
            break;

        default:
            this.logger.logError("Unsupport messsage " + req.t);
    }
};


Decoder.prototype.openDecoder = function (req) {
    let codecID = req.codecID;
    let enableLog=req.enableLog;
    let expectPixfmt=req.expectPixfmt;
    this._openDecoder(codecID,enableLog,expectPixfmt);
}

Decoder.prototype.closeDecoder = function () {

    //关闭解码器
    let ret = Module._closeDecoder(this.handle);
    this.logger.logInfo("_closeDecoder return " + ret + ".");

    //关闭后释放内存
    if (this.cacheBuffer != null) {
        Module._free(this.cacheBuffer);
        this.cacheBuffer = null;
    }

    this.logger.logInfo("解码器已关闭");

    //发送响应
    let objData = {
        type: RESPOND_DECODE_CLOSE,
        ret: ret
    };
    self.postMessage(objData);
}

//发送裸流数据
Decoder.prototype.sendStream = function (req) {

    this._sendStream(req.data);

}

Decoder.prototype.releaseDecoder = function () {
    let ret = Module._destroyDecoder();
    this.logger.logInfo("_destroyDecoder return " + ret + ".");
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



//创建解码器
Decoder.prototype._createDecoder = function () {
    let handle = Module._createDecoder();
    this.handle = handle;
    this.logger.logInfo("_createDecoder return " + this.handle + ".");
};


//打开解码器
//codecID:编码id,与ffmpeg的AVCodecID对应
Decoder.prototype._openDecoder = function (codecID,enableLog,expectPixfmt) {
    let handle = this.handle;
    var ret = Module._openDecoder(handle, codecID, this.videoCallback,enableLog,expectPixfmt);
    this.logger.logInfo("_openDecoder return " + ret);

    if (0 == ret && this.cacheBuffer == null) {
        this.cacheBuffer = Module._malloc(this.cacheSize);
    }
    if (ret != 0) {
        //调用关闭
        this.closeDecoder();
    }

    var objData = {
        type: RESPOND_DECODE_OPEN,
        ret: ret
    };
    self.postMessage(objData);

};


//处理发送数据请求
//dataBuffer：裸流数据
//dataSize:数据长度
Decoder.prototype._sendStream = function (dataBuffer) {
    let handle = this.handle;
    var typedArray = new Uint8Array(dataBuffer);
    Module.HEAPU8.set(typedArray, this.cacheBuffer);
    Module._decodeVideo(handle, this.cacheBuffer, typedArray.length);
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
            type: RESPOND_DECODE_VIDEO_DATA,
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


    this._createDecoder();

    while (this.tmpReqQue.length > 0) {
        var req = this.tmpReqQue.shift();
        this.processReq(req);
    }
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

