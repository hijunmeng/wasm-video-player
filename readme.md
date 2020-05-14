
# web视频解码以及视频融合
## 说明
* 此项目主要是为了研究无插件web播放器以及三维视频融合所做的实验性工程，具有一定参考价值
* 此项目总共分为4部分

* ffmpeg目录主要是编译ffmpeg源码为静态库.a,编译后目标码存放在dist-ffmpeg中，是其他项目的基础

* video-player是一个视频播放器，主要演示了如何利用ffmpeg wasm进行解码播放

* fusion-player是一个3维视频融合，结合threejs库，将解码数据制作成纹理喂给threejs,与3维模型融合呈现出视频融合效果

* fusion-ws-player也是一个3维视频融合，结合threejs库及[流协议解析websocket服务](https://github.com/huweijian5/WebSocketStreamProtocolParseServer) ，实现从websocket服务获取裸流数据后进行解码，再制作成纹理数据，与3维模型呈现出视频融合效果

## 开发环境
* linux

## 技术集
* 本项目的主要使用到的技术及工具如下：
    * ffmpeg
    * webassembly
    * emscripten
    * threejs
    * websocket
    * c++11
    * docker
    * npm
## 目录说明
* 本工程糅合了编译脚本及应用工程，为了保持结构清晰及独立性，目标码会进行多次拷贝，存在一定冗余
### ffmpeg
* dist-ffmpeg目录是存放编译后的目标码，这里提供了一份，实际上应该用户自己编译生成
* download-ffmpeg-with-git.sh 主要就是下载最新版ffmpeg
* build-ffmpeg-emcc.sh 是ffmpeg的自定义编译脚本，可修改其中的配置对ffmpeg进行裁剪
* run-with-docker.sh 是在docker镜像里编译ffmpeg,之所以用docker镜像主要是本地搭建emcc环境总是会出现一些奇怪问题导致编译失败，如果本地环境搭建失败，可考虑使用此镜像
### video-player
* cpps目录存放的是c/c++源码，web调用的接口都是在此开发的
* 最终web要使用的wasm文件就是在此进行编译的
* copy-dist-ffmpeg-to-here.sh 就是将ffmpeg已经编译生成的静态库拷贝至这里参与编译
* build_decode_wasm_dev.sh 是用于开发调试的版本，此脚本编译出来的会携带更多日志信息，但是运行速度变慢，体积会比价大
* build_decode_wasm_pro.sh 是用于最后生产环境的，此脚本编译出来的会进行优化压缩，运行速度会大大提升，体积也会变小
* run-dev-with-docker.sh 和 run-pro-with-docker.sh 是用于docker镜像编译的
* 最后编译成功的文件会放在dist-decoder目录中
* src目录存放js代码，上文编译好的dist-decoder中的目标码要拷贝至src目录下方可使用
* common.js主要是一些常量及日志工具
* decoder.worker.js是调用wasm的包装类，使用线程模式
* player.js是业务调用方，结合decoder.worker.js和webgl.js的功能实现视频解码播放显示
### fusion-player
* 与video-player类似，增加了threejs库，用于在三维场景中实现视频融合
* decoder-wrap.js是对decoder.worker.js的进一步封装，以便于fusion.js使用
### fusion-ws-player
* 与fusion-player类似，主要是decoder-wrap.js增加了websocket通信相关的调用








