"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var path_1 = __importDefault(require("path"));
var dxfParser = require('dxf-parser');
var fs = require('fs').promises;
var _a = require('@flatten-js/core'), Segment = _a.Segment, Arc = _a.Arc, Polygon = _a.Polygon, Point = _a.Point, Circle = _a.Circle;
var parser = new dxfParser();
function readDxf(filePath) {
    return __awaiter(this, void 0, void 0, function () {
        var content, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, fs.readFile(filePath, { encoding: 'utf8' })];
                case 1:
                    content = _a.sent();
                    try {
                        data = parser.parseSync(content);
                        // TODO: how to find out main layer?
                        // if (data.tables?.layer?.layers) {
                        //   const mainLayer = Object.keys(data.tables.layer.layers)[0];
                        //   data.entities = data.entities.filter((entity: Entity) => entity.layer === mainLayer)
                        //     .filter(ent => !ent.inPaperSpace);
                        // }
                        return [2 /*return*/, data];
                    }
                    catch (_b) {
                        return [2 /*return*/, null];
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function lineLength(p1, p2) {
    return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}
function calcEntityLength(entity) {
    switch (entity.type) {
        case 'ARC':
            var angle = entity.endAngle - entity.startAngle;
            if (angle < 0) {
                angle = 2 * Math.PI + angle;
            }
            if (entity.clockwise) {
                angle = 2 * Math.PI - angle;
            }
            return angle * entity.radius;
        case 'LINE':
            return lineLength(entity.edges[0], entity.edges[1]);
        case 'CIRCLE':
            return 2 * Math.PI * entity.radius;
        default:
            throw new Error("Unknown entity: " + entity);
    }
}
function getArcPoint(center, radius, angle) {
    var x = (Math.cos(angle) * radius) + center.x;
    var y = (Math.sin(angle) * radius) + center.y;
    return { x: x, y: y, z: center.z };
}
function findEdges(data) {
    data.entities.forEach(function (entity) {
        if (entity.type === 'ARC') {
            entity.edges = [];
            entity.edges.push(getArcPoint(entity.center, entity.radius, entity.startAngle));
            entity.edges.push(getArcPoint(entity.center, entity.radius, entity.endAngle));
        }
        else if (entity.type === 'LINE') {
            entity.edges = entity.vertices;
        }
        else if (entity.type === 'LWPOLYLINE') {
            entity.edges = [];
            entity.edges.push(entity.vertices[0]);
            if (entity.shape || entity.vertices[entity.vertices.length - 1].bulge) {
                entity.vertices.push(entity.vertices[0]);
            }
            entity.edges.push(entity.vertices[entity.vertices.length - 1]);
        }
        else if (entity.type === 'CIRCLE') {
            entity.edges = [];
            entity.edges.push({ x: entity.center.x + entity.radius, y: entity.center.y });
            entity.edges.push({ x: entity.center.x + entity.radius, y: entity.center.y });
        }
    });
}
var EQUAL_TRESHOLD = 0.01;
function pointsAreEqual(p1, p2) {
    var delta = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
    return delta < EQUAL_TRESHOLD;
}
function swapEdges(entity) {
    var edgePoint = entity.edges[0];
    entity.edges[0] = entity.edges[1];
    entity.edges[1] = edgePoint;
    entity.reverse = true;
}
function vectorAngle(p1, p2) {
    var angle = Math.acos((p2.x - p1.x) / lineLength(p1, p2));
    if (p2.y < p1.y) {
        return (2 * Math.PI) - angle;
    }
    return angle;
}
function cloneVertice(v) {
    return {
        x: v.x,
        y: v.y,
        z: v.z,
        bulge: v.bulge,
    };
}
// split POLYLINE to arcs and lines
function transofrmEntity(entity) {
    if (entity.type !== 'LWPOLYLINE') {
        return [entity];
    }
    var entities = [];
    entity.vertices.forEach(function (verticeParam, index) {
        if (!entity.vertices[index + 1]) {
            return;
        }
        var vertice = cloneVertice(verticeParam);
        var nextVertice = cloneVertice(entity.vertices[index + 1]);
        if (!vertice.bulge) {
            entities.push({
                type: 'LINE',
                vertices: [vertice, nextVertice],
                edges: [vertice, nextVertice],
                polyline: entity,
            });
            return;
        }
        // arc
        var halfSegment = lineLength(vertice, nextVertice) / 2;
        var aGamma = ((Math.PI / 2) - 2 * Math.atan(Math.abs(vertice.bulge)));
        var radius = Math.abs(halfSegment / Math.cos(aGamma));
        var halfSegmentVertice = { x: (vertice.x + nextVertice.x) / 2, y: (vertice.y + nextVertice.y) / 2 };
        var aBeta = vectorAngle(vertice, halfSegmentVertice);
        var centerAngle = aBeta + aGamma * Math.sign(vertice.bulge);
        var center = {
            x: vertice.x + radius * Math.cos(centerAngle),
            y: vertice.y + radius * Math.sin(centerAngle),
        };
        var startAngle = vectorAngle(center, vertice);
        var endAngle = vectorAngle(center, nextVertice);
        var clockwise = Math.sign(vertice.bulge) === -1;
        var arc = {
            type: 'ARC',
            center: center,
            radius: radius,
            startAngle: startAngle,
            endAngle: endAngle,
            edges: [vertice, nextVertice],
            clockwise: clockwise,
            polyline: entity,
        };
        entities.push(arc);
    });
    if (entity.reverse) {
        entities = entities.reverse();
        entities.forEach(function (entity) {
            swapEdges(entity);
        });
    }
    return entities;
}
function findShapes(data) {
    var _a, _b, _c, _d, _e;
    var shapes = [];
    var unknownEntities = {};
    var entities = data.entities.slice().filter(function (entity) {
        if (!entity.edges) {
            var entitiesCount = unknownEntities[entity.type];
            unknownEntities[entity.type] = (entitiesCount || 0) + 1;
            return false;
        }
        return true;
    });
    while (entities.length) {
        var shape = {
            entities: [],
            closed: false,
            single: false,
        };
        var startEntity = entities.shift();
        (_a = shape.entities).push.apply(_a, transofrmEntity(startEntity));
        if (startEntity.type === 'CIRCLE') {
            shape.single = true;
            shape.closed = true;
        }
        shape.start = startEntity.edges[0];
        shape.end = startEntity.edges[1];
        if (pointsAreEqual(shape.start, shape.end)) {
            shape.closed = true;
            shapes.push(shape);
            continue;
        }
        var nextNotFound = false;
        while (!nextNotFound) {
            nextNotFound = true;
            for (var index in entities) {
                var entity = entities[index];
                if (entity.edges) {
                    var entityMatches = false;
                    if (pointsAreEqual(entity.edges[0], shape.start)) {
                        entityMatches = true;
                        swapEdges(entity);
                        (_b = shape.entities).unshift.apply(_b, transofrmEntity(entity));
                        shape.start = entity.edges[0];
                    }
                    else if (pointsAreEqual(entity.edges[0], shape.end)) {
                        entityMatches = true;
                        (_c = shape.entities).push.apply(_c, transofrmEntity(entity));
                        shape.end = entity.edges[1];
                    }
                    else if (pointsAreEqual(entity.edges[1], shape.start)) {
                        entityMatches = true;
                        (_d = shape.entities).unshift.apply(_d, transofrmEntity(entity));
                        shape.start = entity.edges[0];
                    }
                    else if (pointsAreEqual(entity.edges[1], shape.end)) {
                        entityMatches = true;
                        swapEdges(entity);
                        (_e = shape.entities).push.apply(_e, transofrmEntity(entity));
                        shape.end = entity.edges[1];
                    }
                    if (entityMatches) {
                        entities.splice(+index, 1);
                        nextNotFound = false;
                        break;
                    }
                }
            }
            if (pointsAreEqual(shape.start, shape.end)) {
                shape.closed = true;
                break;
            }
        }
        shapes.push(shape);
    }
    return { shapes: shapes, unknownEntities: unknownEntities };
}
function toPoint(vertice) {
    return new Point(vertice.x, vertice.y);
}
function createPolygon(shape) {
    var faces = [];
    shape.entities.forEach(function (entity) {
        if (entity.type === 'LINE') {
            faces.push(new Segment(toPoint(entity.edges[0]), toPoint(entity.edges[1])));
        }
        else if (entity.type === 'ARC') {
            var arc = new Arc(toPoint(entity.center), entity.radius, entity.startAngle, entity.endAngle, !entity.clockwise);
            if (entity.reverse) {
                arc = arc.reverse();
            }
            faces.push(arc);
        }
        else if (entity.type === 'CIRCLE') {
            faces.push((new Circle(toPoint(entity.center), entity.radius)).toArc());
        }
        else {
            throw new Error('unknown entity');
        }
    });
    return new Polygon(faces);
}
var MAIN_INCLUDES_CHECK_TIMEOUT = 1 * 1000;
var CHECK_TIMEOUT_MESSAGE = 'check_timeout';
function findMainShape(shapes) {
    if (shapes.length === 1) {
        return shapes[0];
    }
    var mainShapeIndex = -1;
    for (var i = 1; i < shapes.length; i++) {
        if (shapes[0].polygon.contains(shapes[i].polygon)) {
            mainShapeIndex = 0;
            break;
        }
        if (shapes[i].polygon.contains(shapes[0].polygon)) {
            mainShapeIndex = i;
            break;
        }
    }
    var mainShape = shapes.splice(mainShapeIndex, 1)[0];
    shapes.unshift(mainShape);
    // check all shapes inside main
    var started = new Date().getTime();
    try {
        shapes.forEach(function (shape, index) {
            if (index === 0) {
                return;
            }
            if (!mainShape.polygon.contains(shape.polygon)) {
                throw new Error('Not all shapes inside main shape');
            }
            if (new Date().getTime() - started > MAIN_INCLUDES_CHECK_TIMEOUT) {
                throw new Error(CHECK_TIMEOUT_MESSAGE);
            }
        });
    }
    catch (e) {
        if (e.message === CHECK_TIMEOUT_MESSAGE) {
            mainShape.skippedIncludesCheck = true;
        }
        else {
            throw e;
        }
    }
    return mainShape;
}
var MAX_BORDER_DISTANCE = 10000;
function findBounds(shape) {
    if (!shape.polygon) {
        return null;
    }
    var topSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
    var distanceTop = shape.polygon.distanceTo(topSegment)[0];
    var bottomSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE));
    var distanceBottom = shape.polygon.distanceTo(bottomSegment)[0];
    var leftSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(-MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
    var distanceLeft = shape.polygon.distanceTo(leftSegment)[0];
    var rightSegment = new Segment(new Point(MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
    var distanceRight = shape.polygon.distanceTo(rightSegment)[0];
    return {
        leftBottom: { x: distanceLeft - MAX_BORDER_DISTANCE, y: distanceBottom - MAX_BORDER_DISTANCE },
        rightTop: { x: MAX_BORDER_DISTANCE - distanceRight, y: MAX_BORDER_DISTANCE - distanceTop },
    };
}
function moveVertice(v, dx, dy) {
    v.x = v.x + dx;
    v.y = v.y + dy;
}
function moveEntity(entity, bounds) {
    var dx = -bounds.leftBottom.x;
    var dy = -bounds.leftBottom.y;
    switch (entity.type) {
        case 'LINE':
            moveVertice(entity.edges[0], dx, dy);
            moveVertice(entity.edges[1], dx, dy);
            break;
        case 'CIRCLE':
        case 'ARC':
            moveVertice(entity.center, dx, dy);
            break;
    }
}
function createSVG(filePath, shapes, bounds) {
    return __awaiter(this, void 0, void 0, function () {
        var width, height, viewBox, dy, dx;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    width = bounds.rightTop.x - bounds.leftBottom.x;
                    height = bounds.rightTop.y - bounds.leftBottom.y;
                    shapes.forEach(function (shape) {
                        shape.entities.forEach(function (entity) { return moveEntity(entity, bounds); });
                        shape.polygon = createPolygon(shape);
                    });
                    viewBox = Math.ceil(Math.max(width, height));
                    dy = (viewBox - height) / 2;
                    dx = (viewBox - width) / 2;
                    return [4 /*yield*/, fs.writeFile(filePath, "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n    <svg id=\"stage\" width=\"300\" height=\"300\" viewBox=\"0 0 " + viewBox + " " + viewBox + "\" xmlns=\"http://www.w3.org/2000/svg\" xmlns:xlink=\"http://www.w3.org/1999/xlink\">\n      <g transform=\"scale(1,-1) translate(" + dx + ", " + (dy - viewBox) + ")\">\n        " + shapes.map(function (shape) { return shape.polygon.svg(); }).join('\r\n') + "\n      </g>\n    </svg>\n  ")];
                case 1:
                    _a.sent();
                    return [2 /*return*/];
            }
        });
    });
}
function getFileData(filePath, svgPath) {
    return __awaiter(this, void 0, void 0, function () {
        var data, findShapesResult, shapes, fileData, mainShape, bounds, width, height;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, readDxf(filePath)];
                case 1:
                    data = _a.sent();
                    findEdges(data);
                    findShapesResult = findShapes(data);
                    shapes = findShapesResult.shapes;
                    fileData = {
                        area: 0,
                        perimeter: 0,
                        unknownEntities: findShapesResult.unknownEntities,
                        errors: [],
                        splineExists: !!findShapesResult.unknownEntities.SPLINE,
                        shapes: [],
                        width: 0,
                        height: 0,
                    };
                    shapes = shapes.filter(function (shape, index) {
                        try {
                            shape.polygon = createPolygon(shape);
                        }
                        catch (e) {
                            fileData.errors.push("Shape " + index + " has errors " + e.message);
                            return false;
                        }
                        if (!shape.polygon.isValid()) {
                            fileData.errors.push("Shape " + index + " is invalid");
                        }
                        try {
                            shape.area = shape.polygon.area();
                        }
                        catch (e) {
                            fileData.errors.push("Can not compute area of the shape " + index + ". " + e.message);
                            return false;
                        }
                        try {
                            shape.perimeter = shape.entities.reduce(function (acc, val) {
                                return acc + calcEntityLength(val);
                            }, 0);
                        }
                        catch (e) {
                            fileData.errors.push("Can not compute perimeter of the shape " + index + ". " + e.message);
                            return false;
                        }
                        return true;
                    });
                    try {
                        mainShape = findMainShape(shapes);
                        fileData.area = mainShape.area;
                    }
                    catch (e) {
                        fileData.errors.push('Can not define main shape');
                        return [2 /*return*/, fileData];
                    }
                    if (mainShape.skippedIncludesCheck) {
                        fileData.errors.push('Skipped "all shapes in main shape" check');
                    }
                    fileData.perimeter = shapes.reduce(function (acc, val) { return acc + val.perimeter; }, 0);
                    fileData.shapes = shapes.map(function (shape) { return ({
                        area: shape.area,
                        perimeter: shape.perimeter,
                    }); });
                    bounds = findBounds(mainShape);
                    width = bounds.rightTop.x - bounds.leftBottom.x;
                    height = bounds.rightTop.y - bounds.leftBottom.y;
                    fileData.width = width;
                    fileData.height = height;
                    if (svgPath) {
                        createSVG(svgPath, shapes, bounds);
                    }
                    return [2 /*return*/, fileData];
            }
        });
    });
}
var testData = {
    'samples\\sample.dxf': {
        perimeter: 2713.33190,
    },
    'samples\\sample22.dxf': {
        area: 376751.327972,
        perimeter: 2666.89590,
    },
    'samples\\sample3.dxf': {
        area: 315711.946542,
        perimeter: 2162.07631868,
    },
    'samples\\sample23.dxf': {
        area: 645406.58976,
        perimeter: 3240.772323,
    },
    'samples\\sample24.dxf': {
        area: 478422.621159,
        perimeter: 2699.4747,
    },
    'samples\\sample2.dxf': {
        area: 646756.568891,
        perimeter: 3349.694679,
    },
};
function testSamples() {
    return __awaiter(this, void 0, void 0, function () {
        var err, precision;
        var _this = this;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    err = false;
                    precision = 0.001;
                    return [4 /*yield*/, Promise.all(Object.keys(testData).map(function (path) { return __awaiter(_this, void 0, void 0, function () {
                            var data;
                            return __generator(this, function (_a) {
                                switch (_a.label) {
                                    case 0: return [4 /*yield*/, getFileData(path)];
                                    case 1:
                                        data = _a.sent();
                                        if (data.shapes.length) {
                                            if (!testData[path].perimeter) {
                                                console.log(path + " main perimeter " + data.shapes[0].perimeter);
                                            }
                                            if (testData[path].perimeter && (Math.abs(data.shapes[0].perimeter - testData[path].perimeter) > precision)) {
                                                err = true;
                                                console.log("Test " + path + " failed: perimeter!");
                                            }
                                        }
                                        if (testData[path].area && (Math.abs(data.area - testData[path].area) > precision)) {
                                            err = true;
                                            console.log("Test " + path + " failed: area!");
                                        }
                                        if (testData[path].splineExists && !data.splineExists) {
                                            err = true;
                                            console.log("Test " + path + " failed!");
                                        }
                                        return [2 /*return*/];
                                }
                            });
                        }); }))];
                case 1:
                    _a.sent();
                    if (!err) {
                        console.log('Tests OK');
                    }
                    return [2 /*return*/];
            }
        });
    });
}
function demo() {
    return __awaiter(this, void 0, void 0, function () {
        var filename, data, findShapesResult, shapes, mainShape, bounds;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0: return [4 /*yield*/, testSamples()];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, new Promise(function (resolve) {
                            setTimeout(function () {
                                resolve(false);
                            }, 1000);
                        })];
                case 2:
                    _a.sent();
                    filename = 'samples\\sample.dxf';
                    return [4 /*yield*/, readDxf(filename)];
                case 3:
                    data = _a.sent();
                    findEdges(data);
                    console.log('ents count:', data.entities.length, 'arcs', data.entities.filter(function (e) { return e.type === 'ARC'; }).length);
                    findShapesResult = findShapes(data);
                    console.log(findShapesResult.unknownEntities);
                    shapes = findShapesResult.shapes;
                    console.log('shape count =', shapes.length);
                    shapes = shapes.filter(function (shape, index) {
                        try {
                            shape.polygon = createPolygon(shape);
                        }
                        catch (e) {
                            console.log('shape', index, ' has err', e.message);
                            return false;
                        }
                        if (!shape.polygon.isValid()) {
                            // TODO: what does it actually mean?
                        }
                        return true;
                    });
                    mainShape = findMainShape(shapes);
                    console.log('got main shape, includes check skipped=', !!(mainShape === null || mainShape === void 0 ? void 0 : mainShape.skippedIncludesCheck));
                    mainShape.perimeter = mainShape.entities.reduce(function (acc, val) {
                        return acc + calcEntityLength(val);
                    }, 0);
                    bounds = findBounds(mainShape);
                    createSVG('sample.svg', shapes, bounds);
                    console.log('main e=', mainShape.entities.length, ' a=', mainShape.polygon.area());
                    return [2 /*return*/];
            }
        });
    });
}
var DATA_FOLDER = 'data';
var SVG_FOLDER = 'svg';
function processFile() {
    return __awaiter(this, void 0, void 0, function () {
        var pathIndex, filePath, dir, fileName, data;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    pathIndex = process.argv.findIndex(function (arg) { return arg === '-f'; }) + 1;
                    filePath = process.argv[pathIndex];
                    dir = path_1.default.dirname(filePath);
                    fileName = path_1.default.basename(filePath);
                    return [4 /*yield*/, getFileData(filePath, path_1.default.join(dir, SVG_FOLDER, fileName.replace('.dxf', '.svg')))];
                case 1:
                    data = _a.sent();
                    return [4 /*yield*/, fs.writeFile(path_1.default.join(dir, DATA_FOLDER, fileName.replace('.dxf', '.json')), JSON.stringify(data))];
                case 2:
                    _a.sent();
                    console.log('SUCCESS');
                    return [2 /*return*/];
            }
        });
    });
}
if (process.argv.findIndex(function (arg) { return arg === '-test'; }) > -1) {
    demo();
}
else {
    processFile();
}
