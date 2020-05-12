#!/bin/bash
echo "Beginning Build..."
export DIST_DIR=dist-ffmpeg
rm -rf ${DIST_DIR}
mkdir -p ${DIST_DIR}
cd ffmpeg # enter ffmpeg dir
echo "Beginning configure..."
emconfigure ./configure \
--cc="emcc" --cxx="em++" --ar="emar" --ranlib="emranlib" \
--prefix=$(pwd)/../${DIST_DIR} \
--enable-cross-compile --target-os=none --arch=x86_64 --cpu=generic \
--enable-gpl --enable-version3 \
--disable-programs --disable-ffmpeg --disable-ffplay --disable-ffprobe \
--disable-doc --disable-htmlpages --disable-manpages --disable-podpages --disable-txtpages \
--disable-avdevice  --disable-swresample --disable-postproc --disable-avfilter \
--disable-everything --disable-debug  --disable-logging --disable-network --disable-asm \
--enable-decoder=hevc --enable-decoder=h264  --enable-decoder=aac \
--enable-parser=h264 --enable-parser=hevc --enable-parser=aac \
--enable-demuxer=flv --enable-demuxer=mov --enable-demuxer=avi --enable-demuxer=mpegts \
--enable-protocol=file --enable-protocol=hls
if [ -f "Makefile" ]; then
  echo "Beginning make clean..."
  make clean
fi
echo "Beginning make..."
make -j4
echo "Beginning make install..."
make install
echo "Build finished..."
