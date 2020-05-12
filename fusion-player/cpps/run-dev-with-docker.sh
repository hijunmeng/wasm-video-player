docker run \
	--rm \
	-v $(pwd):/src \
	trzeci/emscripten \
	/bin/bash build_decode_wasm_pro.sh
