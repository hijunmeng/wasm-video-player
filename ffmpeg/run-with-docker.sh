docker run \
	--rm \
	-v $(pwd):/src \
	trzeci/emscripten \
	/bin/bash build-ffmpeg-emcc.sh
