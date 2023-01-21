import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";

import * as Tone from "tone";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./styles.css";
import { MathUtils } from "three";
import { Transport } from "tone/build/esm/core/clock/Transport";

let scene, camera, renderer;
let colour, intensity, light;
let ambientLight;
let grid;

let listener;

let sceneHeight, sceneWidth;

let clock, delta, interval;

let modelLoaded;
let robot, flamingo;

let loader;
let mixers;

let speedZ;
let speedX;

let orbit;

let player, player2, player3, player4, player5, player6;
let pitchShift, synthShift, meter;

let flamingoPosition;

let playerPosx = 0;

let objectsParent;

let OBSTACLE_PREFAB = new THREE.BoxBufferGeometry(1, 1, 1);
let OBSTACLE_MATERIAL = new THREE.MeshBasicMaterial({ color: 0xccdeee });

let startButton = document.getElementById("startButton");
startButton.addEventListener("click", init);

function init() {
  Tone.start();
  //Tone.Transport.stop();
  //Tone.Transport.cancel();
  modelLoaded = false;

  // remove overlay
  let overlay = document.getElementById("overlay");
  overlay.remove();

  //create our clock and set interval at 30 fpx
  clock = new THREE.Clock();
  delta = 0;
  interval = 1 / 25;

  speedZ = -5;
  speedX = 0.004;

  //create our scene
  sceneWidth = window.innerWidth;
  sceneHeight = window.innerHeight;
  scene = new THREE.Scene();
  //scene.background = new THREE.Color(0xdedede);

  //create camera
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.x = 0;
  camera.position.y = 30;
  camera.position.z = -20;
  camera.rotation.x = 180;
  camera.rotation.y = 0;
  camera.rotation.z = 3.14;

  listener = new THREE.AudioListener();
  camera.add(listener);

  //specify our renderer and add it to our document
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  //create the orbit controls instance so we can use the mouse move around our scene
  //orbit = new OrbitControls(camera, renderer.domElement);
  //orbit.enableZoom = true;

  // lighting
  colour = 0xffffff;
  intensity = 1;
  light = new THREE.DirectionalLight(colour, intensity);
  light.position.set(-1, 2, 4);
  scene.add(light);
  ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
  scene.add(ambientLight);

  //AUDIO
  player = new Tone.Player("./sounds/Break1.wav", () => {
    player.loop = true;
    player.autostart = true;
    //player.start = 1;
    //player.playbackrate = 1;
    player.sync();
  });

  player2 = new Tone.Player("./sounds/Break2.wav", () => {
    player2.loop = true;
    player2.autostart = true;
    player2.mute = true;
    //player2.start = 1;
    //player2.playbackrate = 1;
    player2.sync();
  }).toDestination();

  player3 = new Tone.Player("./sounds/Synth1.wav", () => {
    player3.loop = true;
    player3.autostart = true;
    player3.mute = false;
    player3.sync();
  });

  player4 = new Tone.Player("./sounds/Wash.wav", () => {
    player4.loop = true;
    player4.autostart = true;
    player4.mute = false;
    player4.sync();
  }).toDestination();

  player5 = new Tone.Player("./sounds/Violin.wav", () => {
    player5.loop = true;
    player5.autostart = true;
    player5.mute = true;
    player5.sync();
  }).toDestination();

  player6 = new Tone.Player("./sounds/Bass.wav", () => {
    player6.loop = true;
    player6.autostart = true;
    player6.mute = true;
    player6.sync();
  }).toDestination();

  meter = new Tone.Meter();
  meter.smoothing = 0.8;

  pitchShift = new Tone.PitchShift({
    pitch: -10 - speedZ * 0.8
  }).toDestination();

  synthShift = new Tone.PitchShift({
    pitch: playerPosx / 2
  }).toDestination();

  Tone.Transport.bpm.value = 165;

  // Tone.Transport.schedule(function (time) {

  // }, "1m");

  player.connect(pitchShift);
  player3.connect(synthShift);
  player.connect(meter);
  player2.connect(meter);
  pitchShift.connect(meter);
  Tone.Transport.start(1);

  objectsParent = new THREE.Group();
  scene.add(objectsParent);

  // objectsParent.traverse((child) => {
  //   if (child instanceof THREE.Mesh) {
  //     // Z-position in world space
  //     child.sound1.stop();
  //   }
  // });

  for (let i = 0; i < 10; i++) spawnBox();

  let divisions = 30;
  let gridLimit = 200;
  grid = new THREE.GridHelper(gridLimit * 2, divisions, 0xccddee, 0xccddee);

  const moveableZ = [];
  for (let i = 0; i <= divisions; i++) {
    moveableZ.push(1, 1, 0, 0); // move horizontal lines only (1 - point is moveable)
  }
  grid.geometry.setAttribute(
    "moveableZ",
    new THREE.BufferAttribute(new Uint8Array(moveableZ), 1)
  );

  grid.material = new THREE.ShaderMaterial({
    uniforms: {
      speedZ: {
        value: speedZ
      },
      gridLimits: {
        value: new THREE.Vector2(-gridLimit, gridLimit)
      },
      time: {
        value: 0
      }
    },
    vertexShader: `
        uniform float time;
        uniform vec2 gridLimits;
        uniform float speedZ;
        
        attribute float moveableZ;
        
        varying vec3 vColor;
      
        void main() {
          vColor = color;
          float limLen = gridLimits.y - gridLimits.x;
          vec3 pos = position;
          if (floor(moveableZ + 0.5) > 0.5) { // if a point has "moveableZ" attribute = 1 
            float zDist = speedZ * time;
            float curZPos = mod((pos.z + zDist) - gridLimits.x, limLen) + gridLimits.x;
            pos.z = curZPos;
          }
          gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
        }
      `,
    fragmentShader: `
        varying vec3 vColor;
      
        void main() {
          gl_FragColor = vec4(vColor, 1.); // r, g, b channels + alpha (transparency)
        }
      `,
    vertexColors: THREE.VertexColors
  });

  scene.add(grid);

  mixers = [];
  loadModels();

  window.addEventListener("resize", onWindowResize, false); //resize callback
  play();
  console.log(playerPosx);
}

// stop animating (not currently used)
function stop() {
  renderer.setAnimationLoop(null);
}

// simple render function

function render() {
  renderer.render(scene, camera);
}

// start animating

function play() {
  //using the new setAnimationLoop method which means we are WebXR ready if need be
  renderer.setAnimationLoop(() => {
    update();
    render();
  });
}

function spawnBox(refXPos = 0, refZPos = 0) {
  const obj = new THREE.Mesh(OBSTACLE_PREFAB, OBSTACLE_MATERIAL);
  objectsParent.add(obj);
  setupBox(refXPos, refZPos, obj);
}

function setupBox(refXPos, refZPos, obj) {
  obj.scale.set(
    Math.random() * (10 - 2) + 2,
    Math.random() * (10 - 2) + 2,
    Math.random() * (10 - 2) + 2
  );

  obj.position.set(
    refXPos + Math.random() * (30 + 30) - 30,
    obj.scale.y * 0.5,
    -(refZPos - 100 - Math.random() * 100)
  );

  // var sound1 = new THREE.PositionalAudio(listener);
  // const audioLoader = new THREE.AudioLoader();
  // audioLoader.load("sounds/CPC_Basic_Drone_Loop.mp3", function (buffer) {
  //   sound1.setBuffer(buffer);
  //   sound1.setRefDistance(5);
  //   sound1.loop = false;
  //   sound1.duration = 1;
  //   sound1.detune = Math.random() * 2000;
  //   sound1.gain = 0.5;
  //   sound1.play();
  // });
  // obj.add(sound1);
}

// class Mover {
//   constructor(x, y, z) {
//     this.x = x;
//     this.y = y;
//     this.z = z;

//     this.velocity = new THREE.Vector3(0.1, 0.01, 1.0);
//     //this.amplitude = new THREE.Vector3(0.5, 2.5, 0.5);
//     this.geo = new THREE.BoxGeometry(0.5, 0.5, 0.5);
//     this.mat = new THREE.MeshPhongMaterial({
//       color: new THREE.Color(0.2, 0.2, 0.2)
//     });
//     this.box = new THREE.Mesh(this.geo, this.mat);
//     this.box.position.set(this.x, this.y, this.z);
//     var sound1 = new THREE.PositionalAudio(listener);
//     const audioLoader = new THREE.AudioLoader();
//     audioLoader.load("sounds/CPC_Basic_Drone_Loop.mp3", function (buffer) {
//       sound1.setBuffer(buffer);
//       sound1.setRefDistance(10);
//       sound1.play();
//     });
//     this.box.add(sound1);
//     scene.add(this.box);
//   }
// }

//our update function

function update() {
  //orbit.update();
  //update stuff in here
  camera.position.x = playerPosx;
  delta += clock.getDelta();
  speedZ -= 0.02;
  //console.log(speedZ);
  pitchShift.pitch = -5 - speedZ * 0.8;
  synthShift.pitch = playerPosx / 8;
  //player.playbackrate = 1 * speedZ;
  //player2.playbackrate = 1 * speedZ;
  // Tone.Transport.bpm = (1 * -speedZ) / 5;

  if (delta > interval) {
    // The draw or time dependent code are here

    if (speedZ <= -7) {
      player5.mute = false;
    } else {
      player5.mute = true;
    }

    if (speedZ <= -13) {
      player2.mute = false;
    } else {
      player2.mute = true;
    }

    if (speedZ <= -17) {
      player6.mute = false;
    } else {
      player6.mute = true;
    }

    // spawnCounter += 1;

    // if (spawnCounter >= 200) {
    //   new Mover(0, 0, -10);
    //   spawnCounter = 0;
    //   console.log("new mover");
    // }

    for (let i = 0; i < mixers.length; i++) {
      mixers[i].update(delta % interval);
    }

    if (modelLoaded) {
      robot.position.z = MathUtils.mapLinear(
        meter.getValue(),
        -60,
        12,
        0.0,
        4.0
      );
    }

    //grid.material.uniforms.time.value = 4;
    grid.material.uniforms.time.value += -speedZ * 0.1 * (delta * 0.001);
    objectsParent.position.z += speedZ * delta * 0.01;

    objectsParent.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // Z-position in world space
        const childZPos = child.position.z + objectsParent.position.z;
        if (childZPos < -25) {
          // reset the object
          setupBox(playerPosx, objectsParent.position.z, child);
        }
      }
    });
    objectsParent.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        // pos in world space
        const childZPos = child.position.z + objectsParent.position.z;

        // compute thresholds distances
        const thresholdX = 0.3 + child.scale.x / 2;

        if (
          childZPos < 3 &&
          childZPos > -10 &&
          child.position.x > playerPosx - thresholdX &&
          child.position.x < playerPosx + thresholdX
        ) {
          speedZ = speedZ * 0.6;
          delta = delta * 0.9;
          setupBox(playerPosx, objectsParent.position.z, child);
        }
      }
    });

    //delta = delta % interval;

    document.addEventListener("keydown", onDocumentKeyDown, false);
    function onDocumentKeyDown(event) {
      var keyCode = event.which;
      if (keyCode == 65) {
        flamingo.position.x += speedX;
        playerPosx = flamingo.position.x;
      } else if (keyCode == 68) {
        flamingo.position.x -= speedX;
        playerPosx = flamingo.position.x;
      }
    }
  }
}

function onWindowResize() {
  //resize & align
  sceneHeight = window.innerHeight;
  sceneWidth = window.innerWidth;
  renderer.setSize(sceneWidth, sceneHeight);
  camera.aspect = sceneWidth / sceneHeight;
  camera.updateProjectionMatrix();
}

function loadModels() {
  loader = new GLTFLoader();

  // this callback handles loading a flamingo GLTF model with animation data
  const onLoadAnimation = function (gltf, position) {
    flamingo = gltf.scene.children[0]; // look for the first child of the scene contained in the gltf - this is our flamingo model
    flamingo.scale.multiplyScalar(0.15); // scale our model to make it smaller
    flamingo.position.copy(position); // set the desired position

    const animation = gltf.animations[0]; // get animation data from the gltf file and assign it to a varible called animation

    const mixer = new THREE.AnimationMixer(flamingo); //create a new ThreeJS animation mixer and pass our flamingo model to it

    mixers.push(mixer); // add our animation mixer to our mixers array

    const action = mixer.clipAction(animation); // pass the animation data to the animation scheduler in the animation mixer
    action.play(); // start the animation

    scene.add(flamingo); // add our animated flamingo model to our scene
  };

  // the loader will report the loading progress to this function
  const onProgress = function () {
    //console.log("progress");
  };

  // the loader will send any error messages to this function
  const onError = function (errorMessage) {
    console.log(errorMessage);
  };

  // desired position of our flamingo
  flamingoPosition = new THREE.Vector3(-0, 5, 0);

  // load the GLTF file with all required callback functions
  loader.load(
    "models/Parrot.glb", // specify our file path
    function (gltf) {
      // specify the callback function to call once the model has loaded
      onLoadAnimation(gltf, flamingoPosition);
    },
    onProgress, // specify progress callback
    onError // specify error callback
  );
}
