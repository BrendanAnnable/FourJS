(function () {
    "use strict";

    var FourJS = window.FourJS = {};

    FourJS.Object3D = function () {
        this.children = [];
    };

    FourJS.Object3D.prototype.add = function (object) {
        this.children.push(object);
    };

    FourJS.Scene = function () {
        FourJS.Object3D.call(this);
    };
    FourJS.Scene.prototype = Object.create(FourJS.Object3D.prototype);
    FourJS.Scene.prototype.constructor = FourJS.Scene;

    FourJS.Vector3 = function (x, y, z) {
        this.x = x || 0;
        this.y = y || 0;
        this.z = z || 0;
    };

    FourJS.Geometry = function (dimensions) {
        this.dimensions = dimensions || 3;
        this.attributes = {};
    };

    FourJS.LineGeometry = function (vertices) {
        FourJS.Geometry.call(this, 3);

        this.attributes.vertices = {
            needsUpdate: true,
            itemSize: 3,
            count: true,
            value: new Float32Array(vertices)
        };
    };
    FourJS.LineGeometry.prototype = Object.create(FourJS.Geometry.prototype);
    FourJS.LineGeometry.prototype.constructor = FourJS.LineGeometry;

    FourJS.PlaneGeometry = function (width, height) {
        FourJS.Geometry.call(this, 3);

        this.attributes.vertices = {
            needsUpdate: true,
            itemSize: 3,
            value: new Float32Array([
               -width / 2, -height / 2, 0,
               -width / 2,  height / 2, 0,
                width / 2,  height / 2, 0,
                width / 2, -height / 2, 0
            ])
        };

        this.attributes.faces = {
            needsUpdate: true,
            itemSize: 3,
            count: true,
            value: new Uint16Array([
                0,1,3,
                1,2,3
            ])
        };

        this.attributes.uvs = {
            needsUpdate: true,
            itemSize: 2,
            value: new Float32Array([
                0,0,
                0,1,
                1,1,
                1,0
            ])
        };
    };
    FourJS.PlaneGeometry.prototype = Object.create(FourJS.Geometry.prototype);
    FourJS.PlaneGeometry.prototype.constructor = FourJS.PlaneGeometry;

    FourJS.ShaderMaterial = function (options) {
        this.vertexShader = options.vertexShader;
        this.fragmentShader = options.fragmentShader;
        this.attributes = options.attributes || {};
        this.uniforms = options.uniforms || {};
        this.transparent = options.transparent !== undefined ? !!options.transparent : false;
    };

    FourJS.Mesh = function (geometry, material) {
        FourJS.Object3D.call(this);
        this.geometry = geometry;
        this.material = material;
        this.render = true;
    };
    FourJS.Mesh.prototype = Object.create(FourJS.Object3D.prototype);
    FourJS.Mesh.prototype.constructor = FourJS.Mesh;

    FourJS.Line = function (geometry, material) {
        FourJS.Mesh.call(this, geometry, material);
    };
    FourJS.Line.prototype = Object.create(FourJS.Mesh.prototype);
    FourJS.Line.prototype.constructor = FourJS.Line;

    FourJS.RenderTarget = function (width, height) {
        this.width = width;
        this.height = height;
    };

    FourJS.WebGLRenderer = function (options) {
        this.canvas = options.canvas;
        this.autoClear = options.autoClear !== undefined ? options.autoClear : true;
        this.contextParameters = options.contextParameters || {};
        this.gl = display.getContext('webgl', this.contextParameters);
        this.currentBuffer = null
        this.clearRed = 0;
        this.clearGreen = 0;
        this.clearBlue = 0;
        this.clearAlpha = 1;
    };

    FourJS.WebGLRenderer.prototype.bindBuffer = function (type, buffer) {
        if (this.currentBuffer !== buffer) {
            this.gl.bindBuffer(type, buffer);
            this.currentBuffer = buffer;
        }
    }

    FourJS.WebGLRenderer.prototype.prepareObject = function (object) {
        var count = this.prepareGeometry(object);
        this.prepareMaterial(object);
        return count;
    };

    FourJS.WebGLRenderer.prototype.prepareGeometry = function (object) {
        var count = 0;
        var attributes = object.geometry.attributes;
        for (var attributeName in attributes) {
            if (attributes.hasOwnProperty(attributeName)) {
                var attribute = attributes[attributeName];
                var buffer = attribute.__webglBuffer || this.gl.createBuffer();
                if (attribute.needsUpdate) {
                    var type = attribute.value instanceof Uint16Array
                             ? this.gl.ELEMENT_ARRAY_BUFFER
                             : this.gl.ARRAY_BUFFER;
                    this.bindBuffer(type, buffer);
                    this.gl.bufferData(type, attribute.value, this.gl.DYNAMIC_DRAW);
                    attribute.needsUpdate = false;
                }
                if (attribute.count) {
                    count = attribute.value instanceof Uint16Array
                          ? attribute.value.length
                          : attribute.value.length / attribute.itemSize;
                }
                attribute.__webglBuffer = buffer;
            }
        }
        return count;
    };

    FourJS.WebGLRenderer.prototype.prepareMaterial = function (object) {
        var material = object.material;
        var program = material.__webglProgram;
        if (!program) {
            var vertexShader = this.gl.createShader(this.gl.VERTEX_SHADER);
            this.gl.shaderSource(vertexShader, material.vertexShader);
            this.gl.compileShader(vertexShader);
            if (!this.gl.getShaderParameter(vertexShader, this.gl.COMPILE_STATUS)) {
                throw new Error(this.gl.getShaderInfoLog(vertexShader));
            }

            var fragmentShader = this.gl.createShader(this.gl.FRAGMENT_SHADER);
            this.gl.shaderSource(fragmentShader, material.fragmentShader);
            this.gl.compileShader(fragmentShader);
            if (!this.gl.getShaderParameter(fragmentShader, this.gl.COMPILE_STATUS)) {
                throw new Error(this.gl.getShaderInfoLog(fragmentShader));
            }

            program = this.gl.createProgram();
            this.gl.attachShader(program, vertexShader);
            this.gl.attachShader(program, fragmentShader);
            this.gl.linkProgram(program);

            if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
                throw new Error(this.gl.getProgramInfoLog(program));
            }

            material.__webglProgram = program;
        }

        this.gl.useProgram(program);

        var geometry = object.geometry;
        var attributes = material.attributes;
        for (var attributeName in attributes) {
            if (attributes.hasOwnProperty(attributeName)) {
                var attribute = attributes[attributeName];
                var location = attribute.__webglLocation;
                if (location === undefined) {
                    var location = attribute.__webglLocation = this.gl.getAttribLocation(program, attributeName);
                    this.gl.enableVertexAttribArray(location);
                }
                if (location !== -1) {
                    var itemSize = 0;
                    if (attribute.attribute) {
                        var geometryAttribute = geometry.attributes[attribute.attribute];
                        var buffer = geometryAttribute.__webglBuffer;
                        itemSize = geometryAttribute.itemSize;
                    } else if (attribute.value) {
                        var buffer = attribute.__webglBuffer;
                        if (!buffer) {
                            buffer = attribute.__webglBuffer = this.gl.createBuffer();
                            attribute.needsUpdate = true;
                        }
                        if (attribute.needsUpdate) {
                            this.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
                            this.gl.bufferData(this.gl.ARRAY_BUFFER, attribute.value, this.gl.DYNAMIC_DRAW);
                            attribute.needsUpdate = false;
                        }
                        itemSize = attribute.itemSize;
                    }
                    this.bindBuffer(this.gl.ARRAY_BUFFER, buffer);
                    this.gl.vertexAttribPointer(location, itemSize, this.gl.FLOAT, false, 0, 0)
                }
            }
        }

        var uniforms = material.uniforms;
        var textureSlot = 0;
        for (var uniformName in uniforms) {
            if (uniforms.hasOwnProperty(uniformName)) {
                var uniform = uniforms[uniformName];
                var location = uniform.__webglLocation;
                if (location === undefined) {
                    location = uniform.__webglLocation = this.gl.getUniformLocation(program, uniformName);
                    uniform.needsUpdate = true;
                }
                if (location !== -1 && uniform.needsUpdate) {
                    switch (uniform.type) {
                    case 't':
                        this.gl.activeTexture(this.gl.TEXTURE0 + textureSlot);
                        this.gl.bindTexture(this.gl.TEXTURE_2D, uniform.value.__webglTexture);
                        this.gl.uniform1i(location, textureSlot);
                        textureSlot++;
                        break;
                    case 'f':
                        this.gl.uniform1f(location, uniform.value);
                        break;
                    }
                    uniform.needsUpdate = false;
                }
            }
        }
    };

    FourJS.WebGLRenderer.prototype.prepareRenderTarget = function (renderTarget) {
        if (!renderTarget.__webglFramebuffer) {
            var framebuffer = this.gl.createFramebuffer();

            var texture = this.gl.createTexture();
            this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
            this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);

            this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
            this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, texture, 0);

            renderTarget.__webglTexture = texture;
            renderTarget.__webglFramebuffer = framebuffer;
            renderTarget.needsUpdate = true;
        }
        if (renderTarget.needsUpdate) {
            this.gl.bindTexture(this.gl.TEXTURE_2D, renderTarget.__webglTexture);
            this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, renderTarget.width, renderTarget.height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
            renderTarget.needsUpdate = false;
        }
    };

    FourJS.WebGLRenderer.prototype.clearColor = function (r, g, b, a) {
        this.clearRed = r;
        this.clearGreen = g;
        this.clearBlue = b;
        this.clearAlpha = a;
    };

    FourJS.WebGLRenderer.prototype.clear = function () {
        this.gl.clearColor(this.clearRed, this.clearGreen, this.clearBlue, this.clearAlpha);
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT | this.gl.STENCIL_BUFFER_BIT | this.gl.COLOR_BUFFER_BIT);
    };

    FourJS.WebGLRenderer.prototype.resize = function (force) {
        var width = this.canvas.clientWidth;
        var height = this.canvas.clientHeight;
        if (force || this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
            this.gl.viewport(0, 0, width, height);
        }
    };

    FourJS.WebGLRenderer.prototype.render = function (scene, renderTarget) {
        var framebuffer = null;

        if (renderTarget !== undefined) {
            this.prepareRenderTarget(renderTarget);
            framebuffer = renderTarget.__webglFramebuffer;
        }

        this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
        if (this.autoClear) {
            this.clear();
        }
        this.resize();

        for (var i = 0; i < scene.children.length; i++) {
            var child = scene.children[i];
            if (child.render) {
                this.renderObject(child);
            }
        }
    };

    FourJS.WebGLRenderer.prototype.renderObject = function (object) {
        var count = this.prepareObject(object);

        var geometry = object.geometry;
        var material = object.material;

        if (material.transparent) {
            this.gl.enable(this.gl.BLEND);
            this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
        } else {
            this.gl.disable(this.gl.BLEND);
        }

        if (object instanceof FourJS.Line) {
            // TODO: unhack
            var buffer = geometry.attributes.vertices.__webglBuffer;
            this.bindBuffer(this.gl.ARRAY_BUFFER, buffer);

            this.gl.drawArrays(this.gl.LINES, 0, count);
        } else {
            // TODO: unhack
            var buffer = geometry.attributes.faces.__webglBuffer;
            this.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, buffer);

            this.gl.drawElements(this.gl.TRIANGLES, count, this.gl.UNSIGNED_SHORT, 0);
        }
    };
}());