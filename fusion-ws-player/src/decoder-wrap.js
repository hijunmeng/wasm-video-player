//解码器封装

function DecoderWrap(videoCallback, options) {

    this.videoCallback = videoCallback; //视频回调

    //非固定值
    this.playUrl = null;//播放地址
    this.wsUrl = null;

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
        this.expectPixfmt = options.expectPixfmt;  //标签     
    } else {
        this.expectPixfmt = 1;//0--yuv 1--rgb
    }
    this.logger = new Logger(this.tag);

    this.websocket = null;
    this.enableLog=true;
   

    this.init();

}

DecoderWrap.prototype.init = function () {
    this.initDecodeWorker();
    //this.initWebsocket();

}

//>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>对外接口>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>

//开始播放
DecoderWrap.prototype.play = function (wsUrl, playUrl) {
    this.logger.logInfo("Play url= " + playUrl + ",ws url=" + wsUrl);

    if (!playUrl) {
        this.logger.logError("[ER] playVideo error, playUrl empty.");
        return -1;
    }
    this.playUrl = playUrl;

    if (!wsUrl) {
        this.logger.logError("[ER] playVideo error, wsUrl empty.");
        return -1;
    }
    this.wsUrl = wsUrl;

    this.initWebsocket();

};

//停止播放
DecoderWrap.prototype.stop = function () {
    //停止送流后，就去关闭解码器
    if(this.websocket){
        this.websocket.send("{\"request\":\"close_url\",\"serial\":111}");
        
    }
    

}

//释放资源
DecoderWrap.prototype.release = function () {
    this.releaseDecoder();
}




//<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<对外接口<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<

DecoderWrap.prototype.openDecoder = function (codecID) {
    var req = {
        type: REQUEST_DECODE_OPEN,
        codecID: codecID,
        enableLog:this.enableLog,
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



DecoderWrap.prototype.initWebsocket = function () {
    let self = this;
    this.websocket = new WebSocket(this.wsUrl);
    this.websocket.binaryType = "arraybuffer";//设置接收二进制类型，默认是blob
    
    this.websocket.onerror = function (event) {
        console.error("WebSocket error observed:", event);
        self.websocket=null;
    };
    // 打开websocket
    this.websocket.onopen = function (event) {
        console.log('websocket open');
        //打开之后则发送请求，结果在响应里处理
        let json = { request: "open_url", content: self.playUrl, serial: 111 };
        self.websocket.send(JSON.stringify(json));

    }
    // 结束websocket
    this.websocket.onclose = function (event) {
        console.log('websocket close');
        self.websocket=null;
    }
    
    // 接受到信息
    this.websocket.onmessage = function (e) {
        
        if (e.data instanceof ArrayBuffer) {//接收二进制流数据
        //    self.logger.logInfo("ArrayBuffer:byteLength=" + e.data.byteLength);
            self.sendStream(e.data);

        } else {
            console.log("String:data=" + e.data);
            let res = JSON.parse(e.data);
            if (res.response == "open_url") {
                if (res.code == 0) {
                    //成功则开始打开解码器,打开解码器成功后则可以请求流
                    self.openDecoder(res.codeID);
                } else {
                    console.error("open_url failed:" + res.msg);
                }

            } else if (res.response == "close_url") {
                if (res.code == 0) {
                    console.log("close_url success");
                }
                self.closeDecoder();
                this.websocket.close();


            } else if (res.response == "start_take_stream") {
                if (res.code == 0) {
                    console.log("启动取流成功");//流数据会以二进制形式发送过来
                } else {
                    console.log("启动取流失败:" + res.msg);
                }
            }
        }

    }

}

//初始化解码器worker
DecoderWrap.prototype.initDecodeWorker = function () {

    var self = this;
    this.decodeWorker = new Worker("decoder.worker.js");
    this.decodeWorker.onmessage = function (evt) {
        var objData = evt.data;
        if (objData.type != RESPOND_DECODE_VIDEO_DATA) {
            self.logger.logInfo("收到响应：" + JSON.stringify(evt.data));
        }

        switch (objData.type) {

            case RESPOND_DECODE_OPEN://
                self.onOpenDecoder(objData);
                break;
            case RESPOND_DECODE_VIDEO_DATA://收到解码回调
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
    } else {//成功则开始向websocket请求流
        let json = { request: "start_take_stream", serial: 111 };
        this.websocket.send(JSON.stringify(json));
    }

};


DecoderWrap.prototype.onVideoFrame = function (res) {
    this.onVideoParam({
        pixfmt: res.pixfmt,
        width: res.width,
        height: res.height
    });
    // this.logger.logInfo("frame data size=" + res.size + ",timestamp=" + res.timestamp);
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


