//解码器封装

function DecoderWrap(videoCallback, options) {

    this.videoCallback = videoCallback; //视频回调

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

    if (options && options.tag) {
        this.tag = options.tag;  //标签     
    } else {
        this.tag = "decoder-wrap";
    }
    if (options && options.expectPixfmt) {
        this.expectPixfmt = options.expectPixfmt;      
    } else {
        this.expectPixfmt = 1;// 0--yuv  1--rgb
    }
    
    this.logger = new Logger(this.tag);

    this.wasmLogLevel=1;//0--没日志，1--核心日志，2--全部日志
    this.chunkSize=32*1024;

    this.init();

}

DecoderWrap.prototype.init = function () {
    this.initDecodeWorker();
    

}

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>对外接口>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

//开始播放
DecoderWrap.prototype.play = function ( playUrl) {
    this.logger.logInfo("Play url= " + playUrl);

    if (!playUrl) {
        this.logger.logError("[ER] playVideo error, playUrl empty.");
        return -1;
    }
    this.playUrl = playUrl;


    this.openDecoder();


};

//停止播放
DecoderWrap.prototype.stop = function () {

    this.closeDecoder();

}

//释放资源
DecoderWrap.prototype.release = function () {
    this.releaseDecoder();
}




//<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<对外接口<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

DecoderWrap.prototype.openDecoder = function () {
    var req = {
        type: REQUEST_DECODE_OPEN,
        chunkSize: this.chunkSize,
        playUrl: this.playUrl,
        logLevel:this.wasmLogLevel,
        expectPixfmt:this.expectPixfmt
    };
    this.decodeWorker.postMessage(req);
}

DecoderWrap.prototype.closeDecoder = function () {
    var req = {
        type: REQUEST_DECODE_CLOSE
    };
    this.decodeWorker.postMessage(req);
}

DecoderWrap.prototype.sendStream = function (data) {//ArrayBuffer
    var req = {
        type: REQUEST_SEND_STREAM,
        data: data

    };
    this.decodeWorker.postMessage(req, [req.data]);
}

DecoderWrap.prototype.releaseDecoder = function () {
    var req = {
        type: REQUEST_DECODE_RELEASE
    };
    this.decodeWorker.postMessage(req);
}
/////////////////////////////////////////////////////////


//初始化解码器worker
DecoderWrap.prototype.initDecodeWorker = function () {

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
            // case RESPOND_DECODE_VIDEO_DATA://收到解码回调
            //     self.onVideoFrame(objData);
            //     break;

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
DecoderWrap.prototype.onOpenDecoder = function (res) {
    if (res.ret != 0) {
        this.logger.logError("open decoder failed ");
    }

};


DecoderWrap.prototype.onVideoFrame = function (res) {
    this.onVideoParam({
        pixfmt: res.pixfmt,
        width: res.width,
        height: res.height
    });
     this.logger.logInfo("frame data size=" + res.size + ",timestamp=" + res.timestamp);
    //var data = new Uint8Array(res.data);


    //回调出去
    this.videoCallback(res.data, res.width, res.height);


};

DecoderWrap.prototype.onError = function (res) {
    this.logger.logError(JSON.stringify(res));

};


//保存视频相关参数
DecoderWrap.prototype.onVideoParam = function (videoParam) {

    this.pixfmt = videoParam.pixfmt;
    this.videoWidth = videoParam.width;
    this.videoHeight = videoParam.height;

    this.yLength = this.videoWidth * this.videoHeight;
    this.uvLength = (this.videoWidth / 2) * (this.videoHeight / 2);


    // this.logger.logInfo("width="+this.videoWidth+","+this.videoHeight);

};


