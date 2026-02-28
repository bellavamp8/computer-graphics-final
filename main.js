function main() {

    let canvas = document.getElementById('webgl');
    let gl = WebGLUtils.setupWebGL(canvas);

    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.enable(gl.DEPTH_TEST);

    let program = initShaders(gl, "vshader", "fshader");
    gl.useProgram(program);

    let vPosition = gl.getAttribLocation(program, "vPosition");
    let vNormal = gl.getAttribLocation(program, "vNormal");

    let modelViewLoc = gl.getUniformLocation(program, "modelViewMatrix");
    let projectionLoc = gl.getUniformLocation(program, "projectionMatrix");
    let lightLoc = gl.getUniformLocation(program, "lightPosition");

    gl.uniform4fv(lightLoc, flatten(vec4(5, 5, 5, 1)));

    function createSphere(radius, latBands, longBands) {

        let vertices = [];
        let normals = [];
        let indices = [];

        for (let lat = 0; lat <= latBands; lat++) {
            let theta = lat * Math.PI / latBands;
            let sinTheta = Math.sin(theta);
            let cosTheta = Math.cos(theta);

            for (let lon = 0; lon <= longBands; lon++) {
                let phi = lon * 2 * Math.PI / longBands;
                let sinPhi = Math.sin(phi);
                let cosPhi = Math.cos(phi);

                let x = cosPhi * sinTheta;
                let y = cosTheta;
                let z = sinPhi * sinTheta;

                vertices.push(radius * x, radius * y, radius * z);
                normals.push(x, y, z);
            }
        }

        for (let lat = 0; lat < latBands; lat++) {
            for (let lon = 0; lon < longBands; lon++) {
                let first = lat * (longBands + 1) + lon;
                let second = first + longBands + 1;

                indices.push(first, second, first + 1);
                indices.push(second, second + 1, first + 1);
            }
        }

        return { vertices, normals, indices };
    }

    let bigSphere = createSphere(1.5, 30, 30);
    let smallSphere = createSphere(0.4, 20, 20);

    function createBuffers(obj) {

        let vao = {};

        vao.vbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vao.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.vertices), gl.STATIC_DRAW);

        vao.nbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, vao.nbo);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(obj.normals), gl.STATIC_DRAW);

        vao.ibo = gl.createBuffer();
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, vao.ibo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(obj.indices), gl.STATIC_DRAW);

        vao.count = obj.indices.length;
        return vao;
    }

    let big = createBuffers(bigSphere);
    let small = createBuffers(smallSphere);

    let smallTheta = 0.0;
    let cameraTheta = 0.0;

    function render() {

        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        smallTheta += 0.005;
        cameraTheta += 0.01;

        let smallX = 3.0 * Math.cos(smallTheta);
        let smallZ = 3.0 * Math.sin(smallTheta);
        let smallPos = vec3(smallX, 0, smallZ);

        let eye = vec3(
            smallX + 2.0 * Math.cos(cameraTheta),
            1.5,
            smallZ + 2.0 * Math.sin(cameraTheta)
        );

        let modelView = lookAt(eye, smallPos, vec3(0,1,0));
        let projection = perspective(45, canvas.width/canvas.height, 0.1, 100);

        gl.uniformMatrix4fv(projectionLoc, false, flatten(projection));

        // Draw Big Sphere
        let mvBig = mult(modelView, scalem(1,1,1));
        gl.uniformMatrix4fv(modelViewLoc, false, flatten(mvBig));

        gl.bindBuffer(gl.ARRAY_BUFFER, big.vbo);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vPosition);

        gl.bindBuffer(gl.ARRAY_BUFFER, big.nbo);
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);
        gl.enableVertexAttribArray(vNormal);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, big.ibo);
        gl.drawElements(gl.TRIANGLES, big.count, gl.UNSIGNED_SHORT, 0);

        // Draw Small Sphere
        let mvSmall = mult(modelView, translate(smallX,0,smallZ));
        gl.uniformMatrix4fv(modelViewLoc, false, flatten(mvSmall));

        gl.bindBuffer(gl.ARRAY_BUFFER, small.vbo);
        gl.vertexAttribPointer(vPosition, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ARRAY_BUFFER, small.nbo);
        gl.vertexAttribPointer(vNormal, 3, gl.FLOAT, false, 0, 0);

        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, small.ibo);
        gl.drawElements(gl.TRIANGLES, small.count, gl.UNSIGNED_SHORT, 0);

        requestAnimationFrame(render);
    }

    render();
}