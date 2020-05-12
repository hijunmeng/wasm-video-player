#此版为开发调试配置，此配置便于排查错误，但性能会大幅下降
export DIST_DIR=dist-decoder
rm -rf ${DIST_DIR}/*
export TOTAL_MEMORY=1073741824 #512_536870912 64_67108864 256_268435456
export TOTAL_STACK=134217728
export EXPORTED_FUNCTIONS="[ \
    '_createDecoder', \
    '_destroyDecoder', \
    '_openDecoder', \
    '_closeDecoder', \
    '_decodeVideo', \
    '_main', \
    '_malloc', \
    '_free' \
]"
export CPP_DIR=src
export A_DIR=dist-ffmpeg
echo "Running Emscripten..."
emcc ${CPP_DIR}/main.cpp \
     ${CPP_DIR}/NewDecoder.cpp \
     ${CPP_DIR}/Log.cpp \
     ${A_DIR}/lib/libavformat.a \
     ${A_DIR}/lib/libavcodec.a \
     ${A_DIR}/lib/libavutil.a \
     ${A_DIR}/lib/libswscale.a \
    -I "${A_DIR}/include" \
    -I "${CPP_DIR}" \
    -O3 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s ALLOW_TABLE_GROWTH=1 \
    -s EXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
    -s EXTRA_EXPORTED_RUNTIME_METHODS="['addFunction','removeFunction']" \
    -s RESERVED_FUNCTION_POINTERS=20 \
    -o ${DIST_DIR}/libffmpeg.js

echo "Finished Build"
