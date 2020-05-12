//Player request.
const kPlayVideoReq = 0;
const kPauseVideoReq = 1;
const kStopVideoReq = 2;

//Player response.
const kPlayVideoRsp = 0;
const kAudioInfo = 1;
const kVideoInfo = 2;
const kAudioData = 3;
const kVideoData = 4;

//Downloader request.
const kGetFileInfoReq = 0;
const kDownloadFileReq = 1;
const kCloseDownloaderReq = 2;

//Downloader response.
const kGetFileInfoRsp = 0;
const kFileData = 1;

//Downloader Protocol.
const kProtoHttp = 0;
const kProtoWebsocket = 1;

const kInitDecoderReq = "InitDecoderReq";
const kUninitDecoderReq = "UninitDecoderReq";
const kOpenDecoderReq = "OpenDecoderReq";
const kCloseDecoderReq = "CloseDecoderReq";
const kFeedDataReq = "FeedDataReq";
const kDecodeOnePacketReq = "kDecodeOnePacketReq";
const kStartDecodeReq = "StartDecodeReq";
const kStopDecodeReq = "StopDecodeReq";



const kCreateDecoderReq = "CreateDecoderReq";
const kCreateDecoderRsp = "CreateDecoderRsp";
const kDestroyDecoderReq = "DestroyDecoderReq";
const kDestroyDecoderRsp = "DestroyDecoderRsp";


//Decoder response.
const kInitDecoderRsp = "InitDecoderRsp";
const kUninitDecoderRsp = "UninitDecoderRsp";
const kOpenDecoderRsp = "OpenDecoderRsp";
const kCloseDecoderRsp = "CloseDecoderRsp";
const kVideoFrame = "VideoFrame";
const kAudioFrame = "AudioFrame";
const kStartDecodeRsp = "StartDecodeRsp";
const kStopDecodeRsp = "StopDecodeRsp";
const kDecodeFinishedEvt = "DecodeFinishedEvt";
const kRequestDataEvt = "RequestDataEvt";
const kDecodeOnePacketRsp = "kDecodeOnePacketRsp";




const REQUEST_DECODE_OPEN = "REQUEST_DECODE_OPEN";//请求启动解码
const REQUEST_DECODE_CLOSE = "REQUEST_DECODE_CLOSE";//请求关闭解码
const REQUEST_DECODE_RELEASE = "REQUEST_DECODE_RELEASE";//请求释放解码器

const RESPOND_DECODE_OPEN = "RESPOND_DECODE_OPEN";//请求启动解码的响应
const RESPOND_DECODE_CLOSE = "RESPOND_DECODE_CLOSE";//请求关闭解码的响应
const RESPOND_DECODE_RELEASE = "RESPOND_DECODE_RELEASE";//请求释放解码器的响应

const EVENT_DECODE_ERROR = "EVENT_DECODE_ERROR";//错误信息回调
const EVENT_DECODE_NOTIFY = "EVENT_DECODE_NOTIFY";//信息回调




function Logger(module) {
    this.module = module;
}

Logger.prototype.log = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "]" + line);
}

Logger.prototype.logError = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][error] " + line);
}

Logger.prototype.logInfo = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][info] " + line);
}

Logger.prototype.logDebug = function (line) {
    console.log("[" + this.currentTimeStr() + "][" + this.module + "][debug] " + line);
}

Logger.prototype.currentTimeStr = function () {
    var now = new Date(Date.now());
    var year = now.getFullYear();
    var month = now.getMonth() + 1;
    var day = now.getDate();
    var hour = now.getHours();
    var min = now.getMinutes();
    var sec = now.getSeconds();
    var ms = now.getMilliseconds();
    return year + "-" + month + "-" + day + " " + hour + ":" + min + ":" + sec + ":" + ms;
}

