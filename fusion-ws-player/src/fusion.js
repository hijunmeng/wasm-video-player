import * as THREE from '../node_modules/three/build/three.module.js';
import { OrbitControls } from '../node_modules/three/examples/jsm/controls/OrbitControls.js';
import { MTLLoader } from '../node_modules/three/examples/jsm/loaders/MTLLoader.js';
import { OBJLoader } from '../node_modules/three/examples/jsm/loaders/OBJLoader.js';
import { GLTFLoader } from '../node_modules/three/examples/jsm/loaders/GLTFLoader.js';
import { SceneUtils } from '../node_modules/three/examples/jsm/utils/SceneUtils.js';
import Stats from '../node_modules/three/examples/jsm/libs/stats.module.js';


let cityMtlResUrl="../assets/models/city.mtl";
let cityObjResUrl="../assets/models/city.obj";
let cityGltfResUrl="../assets/models/city.gltf";



let mainCanvas;
let camera, scene, renderer, orbitControls;
let uniforms;//传递给shader的数据
let minCamera, minCameraHelper;
let stats;

let shaderMaterial;
let textureD = null;

let decoder;
let webglPlayer;
let useWebgl = false;
let testDepthplane=false;//测试白板关闭深度测试

init();
initRemoteDatas();
render();



function init() {
    initDecoder();
   // initWebGLPlayer();//测试用
    initCanvas();
    initScenes();
    initCameras();
    initLights();
    initRenders();
    initHelpers();
    initMeshs();
    initOthers();

}

function initDecoder() {
    decoder = new DecoderWrap(videoCallback, { tag: "fusion" });

}

function initWebGLPlayer() {
    let canvas = document.getElementById("webgl-canvas");
    webglPlayer = new WebGLPlayer(canvas);
    useWebgl = true;
}

function videoCallback(data, width, height) {
    if (useWebgl) {
        webglPlayer.renderFrame(data, width, height, width * height, width * height / 4);
    } else {
        minCamera.aspect = width / height;
        minCamera.updateProjectionMatrix();
        if (textureD) {
            textureD.image = {
                data: data, width: width, height: height
            };
        } else {
            textureD = new THREE.DataTexture(data, width, height, THREE.RGBFormat);
        }
        uniforms["textureD"].value = textureD;
        textureD.needsUpdate = true;
    }

}


function initOthers() {
    window.addEventListener('resize', onWindowResize, false);
    document.getElementById("playBtn").addEventListener("click", (event) => {
        let wsUrl = "ws://127.0.0.1:9002";
        var playUrl = "rtsp://192.168.39.122/video/265/surfing.265";
        var playUrl = "rtsp://127.0.0.1/video/h265_aac.ts";
        // var playUrl="http://192.168.25.105:8380/live?app=demo&stream=stream-1";
        var playUrl="http://devimages.apple.com/iphone/samples/bipbop/gear3/prog_index.m3u8";

        // var playUrl="rtsp://192.168.40.201:554/PSIA/Streaming/channels/0";
        // var playUrl="rtsp://192.168.39.94:554/PSIA/Streaming/channels/1";
        
        decoder.play(wsUrl, playUrl);
    });
    document.getElementById("stopBtn").addEventListener("click", (event) => {
        decoder.stop();
    });
}

function onWindowResize() {

    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();


    renderer.setSize(window.innerWidth, window.innerHeight);

}


function initMeshs() {
    let geometry = new THREE.BoxGeometry(50, 50, 50);

    let material = new THREE.MeshNormalMaterial();
    // material = new THREE.MeshBasicMaterial( { color: 0x0000ff ,side:THREE.DoubleSide} );
    let mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(0, 150, 0);
    scene.add(mesh);



}
function initCanvas() {
    mainCanvas = document.getElementById("main-canvas");

}

function initCameras() {

    /*
              创建相机【远景相机，与人眼观察类似，近大远小】
              param1:视角【视角越大  物体渲染到屏幕时则看着越小，反之越大】
              param2:相机拍摄面的长宽比
              param3:近裁剪面,相机与物体的距离小于该值后将不在屏幕上显示
              param4:远裁剪面,相机与物体的距离大于该值后将不在屏幕上显示
      */
    camera = new THREE.PerspectiveCamera(75, mainCanvas.offsetWidth / mainCanvas.offsetHeight, 1, 10000);
    camera.position.set(500, 500, 500);//相机的位置
    camera.up.set(0, 1, 0);
    camera.lookAt(0, 0, 0);
    scene.add(camera);

    minCamera = new THREE.PerspectiveCamera(45, mainCanvas.offsetWidth / mainCanvas.offsetHeight, 1, 10000);

    minCamera.position.set(0, 500, 0);//相机的位置
    minCamera.up.set(0, 1, 0);
    minCamera.lookAt(new THREE.Vector3(0, 0, 0));
    scene.add(minCamera);



}

function initScenes() {
    scene = new THREE.Scene();
}

function initRenders() {
    renderer = new THREE.WebGLRenderer({
        canvas: mainCanvas,
        antialias: true, //设置抗锯齿
        alpha: true, //背景透明
        // logarithmicDepthBuffer:true
    });
    // renderer.setPixelRatio(window.devicePixelRatio);
    renderer.setSize(mainCanvas.offsetWidth, mainCanvas.offsetHeight);

    renderer.setClearColor();//黑色
    //告诉渲染器，我们需要阴影映射
    renderer.shadowMap.enabled = true;

    // document.body.appendChild(renderer.domElement);
}

function initHelpers() {
    //帧率监测
    // @ts-ignore
    stats = new Stats();
    stats.showPanel(0); // 0: fps, 1: ms, 2: mb, 3+: custom
    document.body.appendChild(stats.dom);

    //添加坐标轴
    let axes = new THREE.AxesHelper(10000);//参数设置了三条轴线的长度
    scene.add(axes);

    orbitControls = new OrbitControls(camera, renderer.domElement);

    //照相机帮助线
    minCameraHelper = new THREE.CameraHelper(minCamera);
    scene.add(minCameraHelper);

}

function initLights() {
    //创建环境光 不会产生阴影
    // color — 光的颜色值，十六进制，默认值为0xffffff.
    // intensity — 光的强度，默认值为1.
    let ambientLight = new THREE.AmbientLight(0xeeeeee, 1);
    scene.add(ambientLight);

    //平行光
    // DirectionalLight( color, intensity )
    //
    // color — 光的颜色值，十六进制，默认值为0xffffff.
    // intensity — 光的强度，默认值为1.
    let directionalLight = new THREE.DirectionalLight(0xffffcc, 0.5);
    //指定定向光源由z正半轴射向原点（平行光从屏幕外射向屏幕中心）
    directionalLight.position.set(500, 500, 500);
    scene.add(directionalLight);


}

function render() {
    requestAnimationFrame(render);
    stats.begin();

    if (orbitControls) {
        orbitControls.update();
    }

    if (minCameraHelper) {
        minCameraHelper.update();
    }


    //camera.updateProjectionMatrix();
    //   minCamera.updateProjectionMatrix();
    //  changeCanvas();
    renderer.render(scene, camera);
    //textureD.needsUpdate=true;
    stats.end();
}


function initRemoteDatas() {
    //getRemoteOBJCity();
    getRemoteGLTFCity();

    
   
}

function getRemoteGLTFCity(){

    let gltfLoader = new GLTFLoader();

    //相机矩阵
    let viewMatrix = minCamera.matrixWorldInverse;
    let projectionMatrix = minCamera.projectionMatrix;

    uniforms = {

        textureD: { value: textureD }, //
        mviewMatrix: { value: viewMatrix },
        mprojectionMatrix: { value: projectionMatrix }
    };

    let

        shaderMaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: document.getElementById("vertex_shader").textContent,
            fragmentShader: document.getElementById("fragment_shader").textContent,
            depthTest: false
            // side: THREE.DoubleSide

        });

    shaderMaterial.transparent = true;
    shaderMaterial.blending = THREE.NormalBlending;


    // setTimeout(()=>{
    //
    //     uniforms[ "textureD" ].value=new THREE.TextureLoader().load(textureSImage);
    //
    // },10000);
    // setTimeout(()=>{
    //     console.log("dddd");
    //     uniforms[ "textureD" ].value=new THREE.TextureLoader().load(textureDImage);
    // },12000);



    gltfLoader.load(cityGltfResUrl, function (gltf) {

        gltf.animations; // Array<THREE.AnimationClip>
		gltf.scene; // THREE.Group
		gltf.scenes; // Array<THREE.Group>
		gltf.cameras; // Array<THREE.Camera>
        gltf.asset; // Object
        
            //缩放
            gltf.scene.scale.set(2, 2, 2);
            //object.material=;
            //将模型缩放并添加到场景当中
            scene.add(gltf.scene);

            console.log("obj children count=" + gltf.scene.children.length);
            scene.updateMatrixWorld(true);

            for (let k in gltf.scene.children) {

                let children = gltf.scene.children[k];//children实际类型为Mesh
                children.castShadow = true;
                children.receiveShadow = true;

                //children.material.transparent = true;
                // children.material.blending = THREE.CustomBlending;

                let mesh = new SceneUtils.createMultiMaterialObject(children.geometry, [children.material, shaderMaterial]);
                mesh.children[0].scale.set(2, 2, 2);
                mesh.children[1].scale.set(2, 2, 2);
                mesh.updateMatrix();
                scene.add(mesh);



            }


            addWithoutDepthTestMesh();
           

        });

}

function addWithoutDepthTestMesh(){
    if(!testDepthplane){
        return ;
    }
    let geometry2 = new THREE.PlaneGeometry(600, 600);
    let material2 = new THREE.MeshLambertMaterial({ 
        //color: 0x0000ff ,
        map:new THREE.TextureLoader().load("../../assets/image/note.jpg"),
        depthTest:false,
        side:THREE.DoubleSide
    });
    let mesh2 = new THREE.Mesh(geometry2, material2);
    mesh2.position.set(0,-100, 0);
    mesh2.rotation.x=-Math.PI/2;

    scene.add(mesh2);
}

function getRemoteOBJCity() {
    let mtlLoader = new MTLLoader();
    let objLoader = new OBJLoader();

    //相机矩阵
    let viewMatrix = minCamera.matrixWorldInverse;
    let projectionMatrix = minCamera.projectionMatrix;

    uniforms = {

        textureD: { value: textureD }, //
        mviewMatrix: { value: viewMatrix },
        mprojectionMatrix: { value: projectionMatrix }
    };

    let

        shaderMaterial = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: document.getElementById("vertex_shader").textContent,
            fragmentShader: document.getElementById("fragment_shader").textContent,
            depthTest: false
            // side: THREE.DoubleSide

        });

    shaderMaterial.transparent = true;
    shaderMaterial.blending = THREE.NormalBlending;


    // setTimeout(()=>{
    //
    //     uniforms[ "textureD" ].value=new THREE.TextureLoader().load(textureSImage);
    //
    // },10000);
    // setTimeout(()=>{
    //     console.log("dddd");
    //     uniforms[ "textureD" ].value=new THREE.TextureLoader().load(textureDImage);
    // },12000);

    mtlLoader.load(cityMtlResUrl, function (materials) {
        materials.preload();
        objLoader.setMaterials(materials);
        objLoader.load(cityObjResUrl, function (object) {

            //缩放
            object.scale.set(2, 2, 2);
            //object.material=;
            //将模型缩放并添加到场景当中
            scene.add(object);

            console.log("obj children count=" + object.children.length);
            scene.updateMatrixWorld(true);

            for (let k in object.children) {

                let children = object.children[k];//children实际类型为Mesh
                children.castShadow = true;
                children.receiveShadow = true;

                //children.material.transparent = true;
                // children.material.blending = THREE.CustomBlending;

                let mesh = new SceneUtils.createMultiMaterialObject(children.geometry, [children.material, shaderMaterial]);
                mesh.children[0].scale.set(2, 2, 2);
                mesh.children[1].scale.set(2, 2, 2);
                mesh.updateMatrix();
                scene.add(mesh);



            }


            addWithoutDepthTestMesh();
        })

    });


}
