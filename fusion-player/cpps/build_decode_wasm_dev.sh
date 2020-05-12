#此版为开发调试配置，此配置便于排查错误，但性能会大幅下降

rm -rf mine/libffmpeg.wasm mine/libffmpeg.js
export TOTAL_MEMORY=1073741824 #512_536870912 64_67108864 256_268435456
export TOTAL_STACK=134217728
export EXPORTED_FUNCTIONS="[ \
    '_createDecoder', \
    '_destroyDecoder', \
    '_setLogLevel', \
    '_initDecoder', \
    '_openDecoder', \
    '_closeDecoder', \
    '_sendData', \
    '_decodeOnePacket', \ 
    '_main', \
    '_malloc', \
    '_free' \
]"

echo "Running Emscripten..."
emcc cpps/main.cpp cpps/Player.cpp cpps/Decoder.cpp cpps/Log.cpp  \
     dist/lib/libavformat.a dist/lib/libavcodec.a dist/lib/libavutil.a dist/lib/libswscale.a \
    -I "dist/include" \
    -I "cpps" \
    -g4 \
    -s ASSERTIONS=2 \
    -s EXCEPTION_DEBUG=1 \
    -s SAFE_HEAP=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s ALLOW_TABLE_GROWTH=1 \
    -s EXPORTED_FUNCTIONS="${EXPORTED_FUNCTIONS}" \
    -s EXTRA_EXPORTED_RUNTIME_METHODS="['addFunction','removeFunction']" \
    -s RESERVED_FUNCTION_POINTERS=20 \
    -o mine/libffmpeg.js

echo "Finished Build"
