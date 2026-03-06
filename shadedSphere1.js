"use strict";

var canvas, gl;
var program;

// Camera parameters
var near = 0.1, far = 200;
var left = -1.5, right = 1.5, ytop = 1.5, bottom = -1.5;

// Sphere vertices for Earth and Sun
var va = vec4(0.0, 0.0, -1.0, 1);
var vb = vec4(0.0, 0.942809, 0.333333, 1);
var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
var vd = vec4(0.816497, -0.471405, 0.333333, 1);

// Sphere geometry arrays
var pointsArray = [], normalsArray = [], texCoordsArray = [];
var index = 0;

// Satellite arrays
var satellite, satPoints = [], satNorms = [], satTexCoords = [];
var satelliteLoaded = false;

// Broken piece arrays
var brokenPiece, brokenPoints = [], brokenNorms = [], brokenTexCoords = [];
var brokenLoaded = false;

// GPU buffers - created once, reused every frame
var spherePosBuffer, sphereNormBuffer, sphereTexBuffer;
var satPosBuffer, satNormBuffer, satTexBuffer;
var brokenPosBuffer, brokenNormBuffer, brokenTexBuffer;

// Orbital parameters
var orbitAngle = 0;             // Satellite orbit angle
var largeSphereScale = 2;       // Earth
var satelliteScale = 0.1;       // Satellite size
var orbitRadius = 8.0;          // Satellite orbit radius

// Broken piece orbital parameters (orbits the satellite)
var brokenOrbitAngle = 0;
var brokenOrbitRadius = 0.7;    // Tight orbit around the satellite
var brokenOrbitSpeed = 0.03;    // Faster than satellite orbit
var brokenScale = 0.05;

// Camera orbit
var cameraOrbitAngle = 0;
var cameraOrbitRadius = 2.0;
var cameraHeight = 0.5;

// Earth orbit & rotation
var earthOrbitRadius = 40;
var earthOrbitAngle = 0;
var earthOrbitSpeed = 0.005;
var earthRotation = 0;
var earthRotationSpeed = 0.02;

// Material & light
var materialAmbient = vec4(1.0, 0.0, 1.0, 1.0);
var materialDiffuse = vec4(1.0, 1.0, 1.0, 1.0);
var materialSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var materialShininess = 20.0;

var lightPosition = vec3(0.0, 0.0, 0.0);
var lightDiffuse = vec4(0.8, 0.8, 0.8, 1.0);
var lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var lightAmbient = vec4(0.0, 0.0, 0.0, 1.0);

var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;
var useTextureLoc, useReflectionLoc;

// Camera
var eye, at = vec3(0,0,0), up = vec3(0,1,0);

// Controls
var paused = false;
var speedMultiplier = 1.0;
var viewMode = "moonOrbit";

// Textures
var earthTexture, metalTexture;

//----------------------------------------------
// Geometry
//----------------------------------------------
function sphericalTexCoord(v){
    var theta = Math.atan2(v[2], v[0]);
    var phi = Math.acos(v[1]);
    var u = 1.0 - (theta + Math.PI) / (2 * Math.PI);
    var t = 1.0 - (phi / Math.PI);
    return vec2(u, t);
}

function triangle(a, b, c) {
    pointsArray.push(a, b, c);
    normalsArray.push(vec4(a[0],a[1],a[2],0.0));
    normalsArray.push(vec4(b[0],b[1],b[2],0.0));
    normalsArray.push(vec4(c[0],c[1],c[2],0.0));
    texCoordsArray.push(sphericalTexCoord(a), sphericalTexCoord(b), sphericalTexCoord(c));
    index += 3;
}

function divideTriangle(a, b, c, count) {
    if(count > 0){
        var ab = normalize(mix(a,b,0.5), true);
        var ac = normalize(mix(a,c,0.5), true);
        var bc = normalize(mix(b,c,0.5), true);

        divideTriangle(a, ab, ac, count-1);
        divideTriangle(ab, b, bc, count-1);
        divideTriangle(bc, c, ac, count-1);
        divideTriangle(ab, bc, ac, count-1);
    } else {
        triangle(a,b,c);
    }
}

function tetrahedron(a, b, c, d, n){
    divideTriangle(a,b,c,n);
    divideTriangle(d,c,b,n);
    divideTriangle(a,d,b,n);
    divideTriangle(a,c,d,n);
}

//----------------------------------------------
// Texture
//----------------------------------------------
function configureTexture(image) {
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return tex;
}

//----------------------------------------------
// Buffer helpers - create once, bind per draw
//----------------------------------------------
function createBuffer(data, dataSize) {
    let buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(data), gl.STATIC_DRAW);
    return buffer;
}

function bindBuffer(buffer, attName, dataSize) {
    let attrib = gl.getAttribLocation(program, attName);
    if(attrib < 0) return;
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(attrib, dataSize, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(attrib);
}

//----------------------------------------------
// Try to build satellite buffers from satellite.faces
// Called every frame until it succeeds once
//----------------------------------------------
function trySatelliteLoad() {
    if(satelliteLoaded) return;
    if(!satellite || !satellite.faces || satellite.faces.length === 0) return;

    satPoints = []; satNorms = []; satTexCoords = [];
    satellite.faces.forEach(function(face){
        face.faceVertices.forEach(function(v)  { satPoints.push(v); });
        face.faceNormals.forEach(function(n)   { satNorms.push(n);  });
        if(face.faceTexCoords && face.faceTexCoords.length > 0){
            face.faceTexCoords.forEach(function(tc){ satTexCoords.push(tc); });
        }
    });

    if(satPoints.length === 0) return;

    satPosBuffer  = createBuffer(satPoints, 4);
    satNormBuffer = createBuffer(satNorms,  4);
    if(satTexCoords.length > 0){
        satTexBuffer = createBuffer(satTexCoords, 2);
    }

    satelliteLoaded = true;
    console.log("Satellite ready:", satPoints.length, "vertices");
}

//----------------------------------------------
// Poll for broken piece geometry
//----------------------------------------------
function tryBrokenLoad() {
    if(brokenLoaded) return;
    if(!brokenPiece || !brokenPiece.faces || brokenPiece.faces.length === 0) return;

    brokenPoints = []; brokenNorms = []; brokenTexCoords = [];
    brokenPiece.faces.forEach(function(face){
        face.faceVertices.forEach(function(v)  { brokenPoints.push(v); });
        face.faceNormals.forEach(function(n)   { brokenNorms.push(n);  });
        if(face.faceTexCoords && face.faceTexCoords.length > 0){
            face.faceTexCoords.forEach(function(tc){ brokenTexCoords.push(tc); });
        }
    });

    if(brokenPoints.length === 0) return;

    brokenPosBuffer  = createBuffer(brokenPoints, 4);
    brokenNormBuffer = createBuffer(brokenNorms,  4);
    if(brokenTexCoords.length > 0){
        brokenTexBuffer = createBuffer(brokenTexCoords, 2);
    }

    brokenLoaded = true;
    console.log("Broken piece ready:", brokenPoints.length, "vertices");
}

//----------------------------------------------
// Initialization
//----------------------------------------------
window.onload = function init(){
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if(!gl){ alert("WebGL isn't available"); }

    gl.viewport(0,0,canvas.width,canvas.height);
    gl.clearColor(0,0,0,1);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl,"vertex-shader","fragment-shader");
    gl.useProgram(program);

    tetrahedron(va,vb,vc,vd,4);

    // Create sphere buffers once
    spherePosBuffer  = createBuffer(pointsArray, 4);
    sphereNormBuffer = createBuffer(normalsArray, 4);
    sphereTexBuffer  = createBuffer(texCoordsArray, 2);

    // Uniform locations
    modelViewMatrixLoc  = gl.getUniformLocation(program, "modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program, "projectionMatrix");
    useTextureLoc       = gl.getUniformLocation(program, "useTexture");
    useReflectionLoc    = gl.getUniformLocation(program, "useReflection");

    // Lighting uniforms
    gl.uniform4fv(gl.getUniformLocation(program,"lightDiffuse"),    flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(materialDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"lightSpecular"),   flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"materialSpecular"),flatten(materialSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"lightAmbient"),    flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(program,"materialAmbient"), flatten(materialAmbient));
    gl.uniform4fv(gl.getUniformLocation(program,"lightPosition"),   flatten(vec4(lightPosition[0],lightPosition[1],lightPosition[2],0.0)));
    gl.uniform1f (gl.getUniformLocation(program,"shininess"),       materialShininess);

    // Reflection off by default
    gl.uniform1i(useReflectionLoc, 0);

    // Load Earth texture
    var earthImage = new Image();
    earthImage.crossOrigin = "anonymous";
    earthImage.src = "./assets/earthmap1k.bmp";
    earthImage.onload = function(){ earthTexture = configureTexture(earthImage); };

    var metalImage = new Image();
    metalImage.crossOrigin = "anonymous";
    metalImage.src = "./assets/metal.bmp";
    metalImage.onload = function(){ metalTexture = configureTexture(metalImage); };

    // Load satellite - we poll satellite.faces in render() to avoid
    // the race condition where loadCallback fires before we assign it
    satellite = new Model("./assets/satellite.obj","./assets/satellite.mtl");

    // Load broken piece using same polling approach
    brokenPiece = new Model("./assets/satellite_broken.obj","./assets/satellite_broken.mtl");

    // Controls
    window.addEventListener("keydown", function(event){
        switch(event.code){
            case "Space":    paused = !paused;              break;
            case "ArrowUp":  speedMultiplier *= 1.5;        break;
            case "ArrowDown":speedMultiplier /= 1.5;        break;
            case "KeyB":     viewMode = "topDown";          break;
            case "KeyM":     viewMode = "moonOrbit";        break;
        }
    });

    render();
};

//----------------------------------------------
// Rendering
//----------------------------------------------
function render(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Poll every frame until geometry is on the GPU
    trySatelliteLoad();
    tryBrokenLoad();

    if(!paused){
        orbitAngle       += 0.01  * speedMultiplier;
        brokenOrbitAngle += brokenOrbitSpeed * speedMultiplier;
        earthOrbitAngle  += earthOrbitSpeed * speedMultiplier;
        cameraOrbitAngle += 0.008 * speedMultiplier;
        earthRotation    += earthRotationSpeed * speedMultiplier;
    }

    // Positions
    var earthX = earthOrbitRadius * Math.cos(earthOrbitAngle);
    var earthZ = earthOrbitRadius * Math.sin(earthOrbitAngle);
    var earthY = 0;

    var satelliteX = earthX + orbitRadius * Math.cos(orbitAngle);
    var satelliteZ = earthZ + orbitRadius * Math.sin(orbitAngle);
    var satelliteY = earthY;

    // Camera
    if(viewMode === "moonOrbit"){
        eye = vec3(satelliteX + cameraOrbitRadius * Math.cos(cameraOrbitAngle),
                   satelliteY + cameraHeight,
                   satelliteZ + cameraOrbitRadius * Math.sin(cameraOrbitAngle));
        at  = vec3(satelliteX, satelliteY, satelliteZ);
        up  = vec3(0,1,0);
        projectionMatrix = ortho(left, right, bottom, ytop, near, far);
    } else {
        eye = vec3(0, 40, 0);
        at  = vec3(0, 0, 0);
        up  = vec3(0, 0, -1);
        var scale = 70;
        projectionMatrix = ortho(-scale, scale, -scale, scale, near, 200);
    }

    modelViewMatrix = lookAt(eye, at, up);
    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // Always disable reflection unless explicitly needed
    gl.uniform1i(useReflectionLoc, 0);

    //------------- Sun -------------
    bindBuffer(spherePosBuffer,  "vPosition", 4);
    bindBuffer(sphereNormBuffer, "vNormal",   4);
    bindBuffer(sphereTexBuffer,  "vTexCoord", 2);

    gl.uniform1i(useTextureLoc, 0);
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(0.9412, 0.7725, 0.0941, 1)));

    var mvSun = mult(modelViewMatrix, translate(lightPosition[0], lightPosition[1], lightPosition[2]));
    mvSun = mult(mvSun, scalem(5,5,5));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvSun));
    for(var i = 0; i < index; i += 3) gl.drawArrays(gl.TRIANGLES, i, 3);

    //------------- Earth -------------
    bindBuffer(spherePosBuffer,  "vPosition", 4);
    bindBuffer(sphereNormBuffer, "vNormal",   4);
    bindBuffer(sphereTexBuffer,  "vTexCoord", 2);

    if(earthTexture){
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, earthTexture);
        gl.uniform1i(gl.getUniformLocation(program,"tex0"), 0);
        gl.uniform1i(useTextureLoc, 1);
    } else {
        gl.uniform1i(useTextureLoc, 0);
    }

    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(1,1,1,1)));

    var mvEarth = mult(modelViewMatrix, translate(earthX, earthY, earthZ));
    mvEarth = mult(mvEarth, rotateY(earthRotation));
    mvEarth = mult(mvEarth, scalem(largeSphereScale, largeSphereScale, largeSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvEarth));
    for(var i = 0; i < index; i += 3) gl.drawArrays(gl.TRIANGLES, i, 3);

    //------------- Satellite -------------
    if(satelliteLoaded && satPoints.length > 0){

        // Bind satellite's own buffers (isolated from sphere buffers)
        bindBuffer(satPosBuffer,  "vPosition", 4);
        bindBuffer(satNormBuffer, "vNormal",   4);
        bindBuffer(sphereTexBuffer, "vTexCoord", 2); // use sphere UVs for metal texture mapping

        // Bind metal texture
        if(metalTexture){
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, metalTexture);
            gl.uniform1i(gl.getUniformLocation(program,"tex0"), 0);
            gl.uniform1i(useTextureLoc, 1);
        } else {
            gl.uniform1i(useTextureLoc, 0);
        }

        gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(1.0, 1.0, 1.0, 1.0)));

        var mvSatellite = mult(modelViewMatrix, translate(satelliteX, satelliteY, satelliteZ));
        mvSatellite = mult(mvSatellite, scalem(satelliteScale, satelliteScale, satelliteScale));
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvSatellite));

        gl.drawArrays(gl.TRIANGLES, 0, satPoints.length);
    }

    //------------- Broken Piece (orbits satellite) -------------
    if(brokenLoaded && brokenPoints.length > 0){

        bindBuffer(brokenPosBuffer,  "vPosition", 4);
        bindBuffer(brokenNormBuffer, "vNormal",   4);
        bindBuffer(sphereTexBuffer,  "vTexCoord", 2);

        // Use metal texture for the broken piece too
        if(metalTexture){
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, metalTexture);
            gl.uniform1i(gl.getUniformLocation(program,"tex0"), 0);
            gl.uniform1i(useTextureLoc, 1);
        } else {
            gl.uniform1i(useTextureLoc, 0);
        }

        gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(1.0, 1.0, 1.0, 1.0)));

        var brokenX = satelliteX + brokenOrbitRadius * Math.cos(brokenOrbitAngle);
        var brokenZ = satelliteZ + brokenOrbitRadius * Math.sin(brokenOrbitAngle);
        var brokenY = satelliteY;

        var mvBroken = mult(modelViewMatrix, translate(brokenX, brokenY, brokenZ));
        mvBroken = mult(mvBroken, scalem(brokenScale, brokenScale, brokenScale));
        gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvBroken));

        gl.drawArrays(gl.TRIANGLES, 0, brokenPoints.length);
    }

    requestAnimationFrame(render);
}