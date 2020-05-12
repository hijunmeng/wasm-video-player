
function Player(options) {
    this.canvas = null; //要渲染的画布
    this.webglPlayer = null; //webgl播放器
    this.callback = null; //全局错误信息回调，未用


    this.videoRendererTimer = null;

    this.frameBuffer = []; //解码帧队列，timestamp,data(字节数组),size


    if (options && options.tag) {
        this.tag = options.tag;  //标签     
    } else {
        this.tag = "WebPlayer";
    }
    this.logger = new Logger(this.tag);

    //非固定值
    this.playUrl = null;//播放地址

    //音频参数
    this.audioEncoding = null;  //采样位数
    this.audioChannels = 0;     //通道数
    this.audioSampleRate = 0;   //采样率
    //视频参数
    this.pixfmt = 0; //像素格式，目前只支持yuv420p

    this.videoWidth = 0;
    this.videoHeight = 0;
    this.yLength = 0;//y分量长度
    this.uvLength = 0;//u或v分量长度

    this.chunkSize=32*1024;

    this.animationID = 0;

    this.wasmLogLevel=1;//0--没日志，1--核心日志，2--全部日志

    this.init();



    this.camera=null;
    this.renderer=null;
    this.scene=null;

}

Player.prototype.init = function () {
    this.initDecodeWorker();
}

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>对外接口>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

//开始播放
Player.prototype.play = function (url, canvas) {
    this.logger.logInfo("Play " + url + ".");

    if (!url) {
        this.logger.logError("[ER] playVideo error, url empty.");
        return -1;
    }

    if (!canvas) {
        this.logger.logError("[ER] playVideo error, canvas empty.");
        return -1;
    }

    this.canvas = canvas;
    this.playUrl = url;

    this.openDecoder();

    //var playCanvasContext = playCanvas.getContext("2d"); //If get 2d, webgl will be disabled.
    this.webglPlayer = new WebGLPlayer(this.canvas);

    this.displayLoop();


};

//停止播放
Player.prototype.stop = function () {

    //停止循环
    cancelAnimationFrame(this.animationID);

    this.closeDecoder();

}

//释放资源
Player.prototype.release = function () {
    this.releaseDecoder();
}




//<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<对外接口<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

Player.prototype.openDecoder = function () {
    var req = {
        type: REQUEST_DECODE_OPEN,
        chunkSize: this.chunkSize,
        playUrl: this.playUrl,
        logLevel:this.wasmLogLevel
    };
    this.decodeWorker.postMessage(req);
}
Player.prototype.closeDecoder = function () {
    var req = {
        type: REQUEST_DECODE_CLOSE
    };
    this.decodeWorker.postMessage(req);
}

Player.prototype.releaseDecoder = function () {
    var req = {
        type: REQUEST_DECODE_RELEASE
    };
    this.decodeWorker.postMessage(req);
}
/////////////////////////////////////////////////////////





//初始化解码器worker
Player.prototype.initDecodeWorker = function () {

    var self = this;
    this.decodeWorker = new Worker("decoder.worker.js");
    this.decodeWorker.onmessage = function (evt) {
        var objData = evt.data;
        if (objData.type != kVideoFrame) {
            self.logger.logInfo("收到响应：" + JSON.stringify(evt.data));
        }

        switch (objData.type) {

            case RESPOND_DECODE_OPEN://
                self.onOpenDecoder(objData);
                break;
            case kVideoFrame://收到解码回调
                self.onVideoFrame(objData);
                break;
            case EVENT_DECODE_ERROR://收到解码回调
                self.onError(objData);
                break;
        }
    }
};



/////////////////////////////////////////响应///////////////////////////////
//创建解码器的响应
Player.prototype.onOpenDecoder = function (res) {
    if (res.ret != 0) {
        this.logger.logError("open decoder failed ");
    }

};

Player.prototype.onVideoFrame = function (res) {
    this.onVideoParam({
        pixfmt: res.pixfmt,
        width: res.width,
        height: res.height
    });
    // this.logger.logInfo("frame data size=" + res.size + ",timestamp=" + res.timestamp);
    //var data = new Uint8Array(res.data);

    //先缓存起来再去渲染 
    this.bufferFrame(res.data);
    //this.logger.logInfo("缓存一帧:"+res.data.length);

};

Player.prototype.onError = function (res) {
    this.logger.logError(JSON.stringify(res));

};



//保存视频相关参数
Player.prototype.onVideoParam = function (videoParam) {

    this.pixfmt = videoParam.pixfmt;
    this.videoWidth = videoParam.width;
    this.videoHeight = videoParam.height;

    this.yLength = this.videoWidth * this.videoHeight;
    this.uvLength = (this.videoWidth / 2) * (this.videoHeight / 2);


    // this.logger.logInfo("width="+this.videoWidth+","+this.videoHeight);

};
//保存音频相关参数
Player.prototype.onAudioParam = function (audio) {

    var sampleFmt = audio.sampleFmt;
    var channels = audio.channels;
    var sampleRate = audio.sampleRate;

    var encoding = "16bitInt";
    switch (sampleFmt) {
        case 0:
            encoding = "8bitInt";
            break;
        case 1:
            encoding = "16bitInt";
            break;
        case 2:
            encoding = "32bitInt";
            break;
        case 3:
            encoding = "32bitFloat";
            break;
        default:
            this.logger.logError("Unsupported audio sampleFmt " + sampleFmt + "!");
    }
    this.logger.logInfo("Audio encoding " + encoding + ".");

    this.pcmPlayer = new PCMPlayer({
        encoding: encoding,
        channels: channels,
        sampleRate: sampleRate,
        flushingTime: 5000
    });

    this.audioEncoding = encoding;
    this.audioChannels = channels;
    this.audioSampleRate = sampleRate;
};



Player.prototype.restartAudio = function () {
    if (this.pcmPlayer) {
        this.pcmPlayer.destroy();
        this.pcmPlayer = null;
    }

    this.pcmPlayer = new PCMPlayer({
        encoding: this.audioEncoding,
        channels: this.audioChannels,
        sampleRate: this.audioSampleRate,
        flushingTime: 5000
    });
};


//缓存解码帧数据
Player.prototype.bufferFrame = function (frame) {

    this.frameBuffer.push(frame);

    //到这里接下来你应该关心渲染的事了

}


Player.prototype.onAudioFrame = function (frame) {
    this.bufferFrame(frame);
};




//比较缓存中最新一帧和最老一帧的时间戳
Player.prototype.getBufferTimerLength = function () {
    if (!this.frameBuffer || this.frameBuffer.length == 0) {
        return 0;
    }

    let oldest = this.frameBuffer[0];
    let newest = this.frameBuffer[this.frameBuffer.length - 1];
    return newest.timestamp - oldest.timestamp;
};


Player.prototype.displayLoop = function () {
    this.animationID = requestAnimationFrame(this.displayLoop.bind(this));

    if (this.frameBuffer.length == 0) {
        return;
    }

    var frame = this.frameBuffer.shift(); //取出队列头
    //this.logger.logInfo("剩余多少帧未渲染:"+this.frameBuffer.length);
    this.renderVideoFrame(frame);

   

};



Player.prototype.renderVideoFrame = function (data) {
    //this.logger.logInfo("渲染一帧:"+data.length);
    this.webglPlayer.renderFrame(data, this.videoWidth, this.videoHeight, this.yLength, this.uvLength);
};




