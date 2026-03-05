"use strict";

var canvas;
var gl;

var numTimesToSubdivide = 4;
var index = 0;

var pointsArray = [];
var normalsArray = [];
var texCoordsArray = [];

var earthTexture, moonTexture;
var useTextureLoc;

// Camera parameters
var near = 0.1, far = 50;
var left = -3, right = 3, ytop = 3, bottom = -3;

// Sphere vertices
var va = vec4(0.0, 0.0, -1.0, 1);
var vb = vec4(0.0, 0.942809, 0.333333, 1);
var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
var vd = vec4(0.816497, -0.471405, 0.333333, 1);

// Orbital parameters
var orbitAngle = 0;
var largeSphereScale = 2;
var smallSphereScale = 0.3;
var orbitRadius = 8.0;

// Camera cinematic orbit
var cameraOrbitAngle = 0;
var cameraOrbitRadius = 5.0;
var cameraHeight = 2.0;

// Earth orbit and rotation
var earthOrbitRadius = 40;
var earthOrbitAngle = 0;
var earthOrbitSpeed = 0.005;
var earthRotation = 0;
var earthRotationSpeed = 0.02;

// Material properties
var materialAmbient = vec4(1.0, 0.0, 1.0, 1.0);
var materialDiffuse = vec4(1.0, 1.0, 1.0, 1.0);
var materialSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var materialShininess = 20.0;

// Light (directional from Sun)
var lightPosition = vec3(0.0, 0.0, 0.0);
var lightDiffuse = vec4(0.8, 0.8, 0.8, 1.0);
var lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var lightAmbient = vec4(0.0, 0.0, 0.0, 1.0);

var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;
var program;
var eye, at = vec3(0,0,0), up = vec3(0,1,0);

// Orbit control
var paused = false;
var speedMultiplier = 1.0;

// View mode
var viewMode = "moonOrbit";

//----------------------------------------------
// Geometry & Texture coordinates
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

    texCoordsArray.push(sphericalTexCoord(a));
    texCoordsArray.push(sphericalTexCoord(b));
    texCoordsArray.push(sphericalTexCoord(c));

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

    tetrahedron(va,vb,vc,vd,numTimesToSubdivide);

    // Vertex buffer
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,flatten(pointsArray),gl.STATIC_DRAW);
    var vPosition = gl.getAttribLocation(program,"vPosition");
    gl.vertexAttribPointer(vPosition,4,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(vPosition);

    // Normal buffer
    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,flatten(normalsArray),gl.STATIC_DRAW);
    var vNormal = gl.getAttribLocation(program,"vNormal");
    gl.vertexAttribPointer(vNormal,4,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(vNormal);

    // Texture buffer
    var tBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER,tBuffer);
    gl.bufferData(gl.ARRAY_BUFFER,flatten(texCoordsArray),gl.STATIC_DRAW);
    var vTexCoord = gl.getAttribLocation(program,"vTexCoord");
    gl.vertexAttribPointer(vTexCoord,2,gl.FLOAT,false,0,0);
    gl.enableVertexAttribArray(vTexCoord);

    // Matrices
    modelViewMatrixLoc = gl.getUniformLocation(program,"modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program,"projectionMatrix");
    useTextureLoc = gl.getUniformLocation(program,"useTexture");

    // Lighting uniforms
    gl.uniform4fv(gl.getUniformLocation(program,"lightDiffuse"),flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"),flatten(materialDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"lightSpecular"),flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"materialSpecular"),flatten(materialSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"lightAmbient"),flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(program,"materialAmbient"),flatten(materialAmbient));

    gl.uniform4fv(gl.getUniformLocation(program,"lightPosition"),
                  flatten(vec4(lightPosition[0],lightPosition[1],lightPosition[2],0.0)));
    gl.uniform1f(gl.getUniformLocation(program,"shininess"),materialShininess);

    // Load Earth texture
    var earthImage = new Image();
    earthImage.crossOrigin = "anonymous";
    earthImage.src = "earthmap1k.bmp";
    earthImage.onload = function(){
        earthTexture = configureTexture(earthImage);
        console.log("Earth texture loaded");
    };

    // Load Moon texture
    var moonImage = new Image();
    moonImage.crossOrigin = "anonymous";
    moonImage.src = "metal.bmp";
    moonImage.onload = function(){
        moonTexture = configureTexture(moonImage);
        console.log("Moon texture loaded");
    };

    // Key controls
    window.addEventListener("keydown",function(event){
        switch(event.code){
            case "Space": paused = !paused; break;
            case "ArrowUp": speedMultiplier *= 1.5; break;
            case "ArrowDown": speedMultiplier /= 1.5; break;
            case "KeyB": viewMode = "topDown"; break;
            case "KeyM": viewMode = "moonOrbit"; break;
        }
    });

    render();
};

//----------------------------------------------
// Rendering
//----------------------------------------------
function render(){
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if(!paused){
        orbitAngle += 0.01 * speedMultiplier;
        earthOrbitAngle += earthOrbitSpeed * speedMultiplier;
        cameraOrbitAngle += 0.008 * speedMultiplier;
        earthRotation += earthRotationSpeed * speedMultiplier;
    }

    var earthX = earthOrbitRadius * Math.cos(earthOrbitAngle);
    var earthZ = earthOrbitRadius * Math.sin(earthOrbitAngle);
    var earthY = 0;

    var moonX = earthX + orbitRadius * Math.cos(orbitAngle);
    var moonZ = earthZ + orbitRadius * Math.sin(orbitAngle);
    var moonY = earthY;

    // Camera
    if(viewMode === "moonOrbit"){
        eye = vec3(
            moonX + cameraOrbitRadius * Math.cos(cameraOrbitAngle),
            moonY + cameraHeight,
            moonZ + cameraOrbitRadius * Math.sin(cameraOrbitAngle)
        );
        at = vec3(moonX,moonY,moonZ);
        up = vec3(0,1,0);
        projectionMatrix = ortho(left,right,bottom,ytop,near,far);
    }
    else{
        eye = vec3(0,40,0);
        at = vec3(0,0,0);
        up = vec3(0,0,-1);
        var scale = 70;
        projectionMatrix = ortho(-scale,scale,-scale,scale,near,far);
    }

    modelViewMatrix = lookAt(eye,at,up);
    gl.uniformMatrix4fv(projectionMatrixLoc,false,flatten(projectionMatrix));

    //----------------------------------
    // Sun
    //----------------------------------
    gl.uniform1i(useTextureLoc,false);
    var sunScale = 5;
    var mvSun = mult(modelViewMatrix, translate(lightPosition[0], lightPosition[1], lightPosition[2]));
    mvSun = mult(mvSun, scalem(sunScale, sunScale, sunScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvSun));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"),flatten(vec4(0.9412,0.7725,0.0941,1)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    //----------------------------------
    // Earth (TEXTURED)
    //----------------------------------
    if(earthTexture){
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, earthTexture);
        gl.uniform1i(gl.getUniformLocation(program,"tex0"), 0);
        gl.uniform1i(useTextureLoc,true);
    }

    var mvEarth = mult(modelViewMatrix, translate(earthX, earthY, earthZ));
    mvEarth = mult(mvEarth, rotateY(earthRotation));
    mvEarth = mult(mvEarth, scalem(largeSphereScale, largeSphereScale, largeSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvEarth));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(1.0,1.0,1.0,1.0)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    //----------------------------------
    // Moon (TEXTURED)
    //----------------------------------
    if(moonTexture){
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, moonTexture);
        gl.uniform1i(gl.getUniformLocation(program,"tex0"), 0);
        gl.uniform1i(useTextureLoc,true);
    }

    var mvMoon = mult(modelViewMatrix, translate(moonX, moonY, moonZ));
    mvMoon = mult(mvMoon, scalem(smallSphereScale, smallSphereScale, smallSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvMoon));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"),flatten(vec4(1.0,1.0,1.0,1.0)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    requestAnimationFrame(render);
}