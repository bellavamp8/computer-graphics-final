var canvas;
var gl;

var numTimesToSubdivide = 4;

var index = 0;

var pointsArray = [];
var normalsArray = [];

//Make sure these are set properly, 
//or sphere could appear black
var near = 0.1;
var far = 50;

var left = -3.0;
var right = 3.0;
var ytop =3.0;
var bottom = -3.0;

var va = vec4(0.0, 0.0, -1.0,1);
var vb = vec4(0.0, 0.942809, 0.333333, 1);
var vc = vec4(-0.816497, -0.471405, 0.333333, 1);
var vd = vec4(0.816497, -0.471405, 0.333333,1);


var lightPosition = vec4(3.0, 3.0, 10.0, 1.0);  // slightly above and in front
var lightDiffuse = vec4(0.8, 0.8, 0.8, 1.0);   // main light source
var lightSpecular = vec4(1.0, 1.0, 1.0, 1.0);  // strong highlights
var lightAmbient = vec4(0.05, 0.05, 0.05, 1.0);  // very low ambient 



var materialAmbient = vec4( 1.0, 0.0, 1.0, 1.0 );
var materialDiffuse = vec4( 1.0, 1.0, 0.0, 1.0 );
var materialSpecular = vec4( 1.0, 1.0, 1.0, 1.0 );
var materialShininess = 20.0;

var modelViewMatrix, projectionMatrix;
var modelViewMatrixLoc, projectionMatrixLoc;

var eye;
var at = vec3(0.0, 0.0, 0.0);
var up = vec3(0.0, 1.0, 0.0);
eye = vec3(0, 0, 15);

var orbitAngle = 0;       // angle for orbiting
var largeSphereScale = 1; // make the main sphere huge
var smallSphereScale = 0.3; // size of orbiting sphere
var orbitRadius = 3.0;    // distance from large sphere
var orbitTilt = 0.5;      // tilt angle (controls Y movement)

var camOrbitAngle = 0;     // angle for camera orbit around the small sphere
var camRadius = 2;       // distance from small sphere
var camHeight = 1;       // vertical offset above small sphere




function triangle(a, b, c) {



     pointsArray.push(a);
     pointsArray.push(b);
     pointsArray.push(c);

     // normals are vectors but where w = 0.0,
     // since normals do not have a homogeneous coordinate
     normalsArray.push(a[0],a[1], a[2], 0.0);
     normalsArray.push(b[0],b[1], b[2], 0.0);
     normalsArray.push(c[0],c[1], c[2], 0.0);

     index += 3;

}


function divideTriangle(a, b, c, count) {
    if ( count > 0 ) {

        var ab = mix( a, b, 0.5);
        var ac = mix( a, c, 0.5);
        var bc = mix( b, c, 0.5);

        ab = normalize(ab, true);
        ac = normalize(ac, true);
        bc = normalize(bc, true);

        divideTriangle( a, ab, ac, count - 1 );
        divideTriangle( ab, b, bc, count - 1 );
        divideTriangle( bc, c, ac, count - 1 );
        divideTriangle( ab, bc, ac, count - 1 );
    }
    else {
        triangle( a, b, c );
    }
}


function tetrahedron(a, b, c, d, n) {
    divideTriangle(a, b, c, n);
    divideTriangle(d, c, b, n);
    divideTriangle(a, d, b, n);
    divideTriangle(a, c, d, n);
}

window.onload = function init() {

    canvas = document.getElementById( "gl-canvas" );

    gl = WebGLUtils.setupWebGL( canvas );
    if ( !gl ) { alert( "WebGL isn't available" ); }

    gl.viewport( 0, 0, canvas.width, canvas.height );
    gl.clearColor( 0.0, 0.0, 0.0, 1.0 );

    gl.enable(gl.DEPTH_TEST);

    //
    //  Load shaders and initialize attribute buffers
    //
    var program = initShaders( gl, "vertex-shader", "fragment-shader" );
    gl.useProgram( program );


    tetrahedron(va, vb, vc, vd, numTimesToSubdivide);

    //Pass in vertex data
    var vBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(pointsArray), gl.STATIC_DRAW);

    var vPosition = gl.getAttribLocation( program, "vPosition");
    gl.vertexAttribPointer(vPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vPosition);

    //Pass in normal data
    var vNormal = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vNormal);
    gl.bufferData(gl.ARRAY_BUFFER, flatten(normalsArray), gl.STATIC_DRAW);

    var vNormalPosition = gl.getAttribLocation( program, "vNormal");
    gl.vertexAttribPointer(vNormalPosition, 4, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(vNormalPosition);

    //Pass in transformation matrices
    modelViewMatrixLoc = gl.getUniformLocation( program, "modelViewMatrix" );
    projectionMatrixLoc = gl.getUniformLocation( program, "projectionMatrix" );

    //Pass in parameters for lighting equations
    gl.uniform4fv(gl.getUniformLocation(program, "lightDiffuse"), flatten(lightDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program, "materialDiffuse"), flatten(materialDiffuse));
    gl.uniform4fv(gl.getUniformLocation(program, "lightSpecular"), flatten(lightSpecular));
    gl.uniform4fv(gl.getUniformLocation(program, "materialSpecular"), flatten(materialSpecular));
    gl.uniform4fv(gl.getUniformLocation(program, "lightAmbient"), flatten(lightAmbient));
    gl.uniform4fv(gl.getUniformLocation(program, "materialAmbient"), flatten(materialAmbient));

    gl.uniform4fv(gl.getUniformLocation(program, "lightPosition"), flatten(lightPosition));
    gl.uniform1f(gl.getUniformLocation(program, "shininess"), materialShininess);

    render();
}


function render() {
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Increase orbit angle quickly
    orbitAngle += 0.05;  // speed of orbit

    // Compute small sphere position in a tilted orbit
    var orbitX = orbitRadius * Math.cos(orbitAngle);
    var orbitZ = orbitRadius * Math.sin(orbitAngle);
    var orbitY = orbitTilt * Math.sin(orbitAngle * 2.0); // tilt for vertical motion
    var smallSpherePos = vec3(orbitX, orbitY, orbitZ);

    // ---- Fixed camera ----
    eye = vec3(0.0, 5.0, 15.0); // high and back
    at = vec3(0.0, 0.0, 0.0);   // always look at large sphere
    modelViewMatrix = lookAt(eye, at, up);
    projectionMatrix = ortho(left, right, bottom, ytop, near, far);

    gl.uniformMatrix4fv(projectionMatrixLoc, false, flatten(projectionMatrix));

    // ---- Draw large central sphere ----
    var mvLarge = mult(modelViewMatrix, scalem(largeSphereScale, largeSphereScale, largeSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvLarge));
    for (var i = 0; i < index; i += 3)
        gl.drawArrays(gl.TRIANGLES, i, 3);

    // ---- Draw small orbiting sphere ----
    var mvSmall = mult(modelViewMatrix, translate(orbitX, orbitY, orbitZ));
    mvSmall = mult(mvSmall, scalem(smallSphereScale, smallSphereScale, smallSphereScale));
    gl.uniformMatrix4fv(modelViewMatrixLoc, false, flatten(mvSmall));
    for (var i = 0; i < index; i += 3)
        gl.drawArrays(gl.TRIANGLES, i, 3);

    requestAnimationFrame(render); // continuous animation
}