var canvas;
var gl;

var numTimesToSubdivide = 4;

var index = 0;
var pointsArray = [];
var normalsArray = [];

// Camera and view parameters
var near = 0.1;
var far = 50;
var left = -3.0;
var right = 3.0;
var ytop = 3.0;
var bottom = -3.0;

// Sphere vertices
var va = vec4(0.0, 0.0, -1.0, 1);
var vb = vec4(0.0, 0.942809, 0.333333, 1);
var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
var vd = vec4(0.816497, -0.471405, 0.333333, 1);

// Orbital parameters
var orbitAngle = 0;       // Moon orbit around Earth
var largeSphereScale = 2;
var smallSphereScale = 0.3;
var orbitRadius = 8.0;

// Camera cinematic orbit parameters
var cameraOrbitAngle = 0;
var cameraOrbitRadius = 5.0;
var cameraHeight = 2.0;

// Earth orbit parameters
var earthOrbitRadius = 10;
var earthOrbitAngle = 0;
var earthOrbitSpeed = 0.005;

// Material properties
var materialAmbient = vec4(1.0, 0.0, 1.0, 1.0);
var materialDiffuse = vec4(1.0, 1.0, 0.0, 1.0);
var materialSpecular = vec4(1.0, 1.0, 1.0, 1.0);
var materialShininess = 20.0;

// ---------------- FIXED POINT LIGHT ----------------
var lightPosition = vec3(10.0, 10.0, 10.0); // fixed point light
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
var viewMode = "moonOrbit"; // "moonOrbit" or "topDown"

// Geometry
function triangle(a, b, c) {
    pointsArray.push(a, b, c);
    normalsArray.push(a[0], a[1], a[2], 0.0);
    normalsArray.push(b[0], b[1], b[2], 0.0);
    normalsArray.push(c[0], c[1], c[2], 0.0);
    index += 3;
}

function divideTriangle(a, b, c, count) {
    if(count > 0) {
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

function tetrahedron(a, b, c, d, n) {
    divideTriangle(a,b,c,n);
    divideTriangle(d,c,b,n);
    divideTriangle(a,d,b,n);
    divideTriangle(a,c,d,n);
}

// Initialization
window.onload = function init() {
    canvas = document.getElementById("gl-canvas");
    gl = WebGLUtils.setupWebGL(canvas);
    if(!gl){ alert("WebGL isn't available"); }

    gl.viewport(0,0,canvas.width, canvas.height);
    gl.clearColor(0.0,0.0,0.0,1.0);
    gl.enable(gl.DEPTH_TEST);

    program = initShaders(gl, "vertex-shader", "fragment-shader");
    gl.useProgram(program);

    tetrahedron(va,vb,vc,vd,numTimesToSubdivide);

    // Vertex buffer
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation(program,"vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0,0);
    gl.enableVertexAttribArray(vPosition);

    // Normal buffer
    var nBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, nBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalsArray), gl.STATIC_DRAW);

    var vNormal = gl.getAttribLocation(program,"vNormal");
    gl.vertexAttribPointer(vNormal, 4, gl.FLOAT, false, 0,0);
    gl.enableVertexAttribArray(vNormal);

    // Matrices
    modelViewMatrixLoc = gl.getUniformLocation(program,"modelViewMatrix");
    projectionMatrixLoc = gl.getUniformLocation(program,"projectionMatrix");

    // Pass fixed point light & material uniforms
    gl.uniform4fv(gl.getUniformLocation(program,"lightDiffuse"), flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(materialDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program,"lightSpecular"), flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"materialSpecular"), flatten(materialSpecular));
    gl.uniform4fv(gl.getUniformLocation(program,"lightAmbient"), flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(program,"materialAmbient"), flatten(materialAmbient));
    gl.uniform4fv(gl.getUniformLocation(program,"lightPosition"),
                  flatten(vec4(lightPosition[0], lightPosition[1], lightPosition[2], 1.0))); // w=1 for point light
    gl.uniform1f(gl.getUniformLocation(program,"shininess"), materialShininess);

    // Key bindings
    window.addEventListener("keydown", function(event){
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

// Rendering
function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    if(!paused){
        orbitAngle += 0.01 * speedMultiplier;
        earthOrbitAngle += earthOrbitSpeed * speedMultiplier;
        cameraOrbitAngle += 0.008 * speedMultiplier;
    }

    // Earth position
    var earthX = earthOrbitRadius * Math.cos(earthOrbitAngle);
    var earthZ = earthOrbitRadius * Math.sin(earthOrbitAngle);
    var earthY = 0;
    var earthPos = vec3(earthX, earthY, earthZ);

    // Moon position
    var moonX = earthX + orbitRadius * Math.cos(orbitAngle);
    var moonZ = earthZ + orbitRadius * Math.sin(orbitAngle);
    var moonY = earthY;
    var moonPos = vec3(moonX, moonY, moonZ);

    // Camera
    if(viewMode === "moonOrbit"){
        // Cinematic Moon orbit
        eye = vec3(
            moonX + cameraOrbitRadius * Math.cos(cameraOrbitAngle),
            moonY + cameraHeight,
            moonZ + cameraOrbitRadius * Math.sin(cameraOrbitAngle)
        );
        at = moonPos;
        up = vec3(0,1,0);
        projectionMatrix = ortho(left, right, bottom, ytop, near, far);
    } else if(viewMode === "topDown"){
        // Fixed camera above origin looking straight down
        eye = vec3(0,10,0);
        at = vec3(0,0,0);
        up = vec3(0,0,-1);
        var scale = 25; // large enough to see both Earth and Moon
        projectionMatrix = ortho(-scale, scale, -scale, scale, near, far);
    }

    modelViewMatrix = lookAt(eye, at, up);
    gl.uniformMatrix4fv(projectionMatrixLoc,false,flatten(projectionMatrix));

    // Draw Sun (visual only)
    var mvSun = mult(modelViewMatrix, translate(0,0,-50));
    mvSun = mult(mvSun, scalem(5,5,5));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvSun));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(0.9412, 0.7725, 0.0941, 1.0)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    // Draw Earth
    var mvEarth = mult(modelViewMatrix, translate(earthX, earthY, earthZ));
    mvEarth = mult(mvEarth, scalem(largeSphereScale, largeSphereScale, largeSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvEarth));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(0.0941, 0.1647, 0.9412, 1.0)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    // Draw Moon
    var mvMoon = mult(modelViewMatrix, translate(moonX, moonY, moonZ));
    mvMoon = mult(mvMoon, scalem(smallSphereScale, smallSphereScale, smallSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc,false,flatten(mvMoon));
    gl.uniform4fv(gl.getUniformLocation(program,"materialDiffuse"), flatten(vec4(0.6784, 0.68235, 0.70196, 1.0)));
    for(var i=0;i<index;i+=3) gl.drawArrays(gl.TRIANGLES,i,3);

    requestAnimationFrame(render);
}