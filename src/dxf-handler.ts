import path from 'path';

const dxfParser = require('dxf-parser');
const fs = require('fs').promises;
const { Segment, Arc, Polygon, Point, Circle } = require('@flatten-js/core');

const parser = new dxfParser();

interface Vertice {
  x: number;
  y: number;
  z?: number;
  bulge?: number;
}

interface Entity {
  type: 'LINE' | 'ARC' | 'CIRCLE' | 'LWPOLYLINE';
  vertices?: Vertice[];
  center?: Vertice;
  radius?: number;
  startAngle?: number;
  endAngle?: number;
  edges?: Vertice[];
  reverse?: boolean;
  shape?: boolean; // if closed polyline
  clockwise?: boolean; // for arc
  polyline?: Entity;
  layer?: string;
}

interface DxfData {
  entities: Entity[];
  tables: any;
}

async function readDxf(filePath: string): Promise<DxfData> {
  const content = await fs.readFile(filePath, { encoding: 'utf8' });
  try {
    const data = parser.parseSync(content);
    // TODO: how to find out main layer?
    // if (data.tables?.layer?.layers) {
    //   const mainLayer = Object.keys(data.tables.layer.layers)[0];
    //   data.entities = data.entities.filter((entity: Entity) => entity.layer === mainLayer)
    //     .filter(ent => !ent.inPaperSpace);
    // }
    return data;
  } catch {
    return null;
  }
}

function lineLength(p1: Vertice, p2: Vertice) {
  return Math.sqrt(Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2));
}

function calcEntityLength(entity: Entity) {
  switch (entity.type) {
    case 'ARC':
      let angle: number = entity.endAngle - entity.startAngle;
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
      throw new Error(`Unknown entity: ${entity}`);
  }
}

function getArcPoint(center: Vertice, radius: number, angle: number) {
  const x: number = (Math.cos(angle) * radius) + center.x;
  const y: number = (Math.sin(angle) * radius) + center.y;
  return { x, y, z: center.z };
}

function findEdges(data: DxfData): void {
  data.entities.forEach((entity: Entity) => {
    if (entity.type === 'ARC') {
      entity.edges = [];
      entity.edges.push(getArcPoint(entity.center, entity.radius, entity.startAngle));
      entity.edges.push(getArcPoint(entity.center, entity.radius, entity.endAngle));
    } else if (entity.type === 'LINE') {
      entity.edges = entity.vertices;
    } else if (entity.type === 'LWPOLYLINE') {
      entity.edges = [];
      entity.edges.push(entity.vertices[0]);
      if (entity.shape || entity.vertices[entity.vertices.length - 1].bulge) {
        entity.vertices.push(entity.vertices[0]);
      }
      entity.edges.push(entity.vertices[entity.vertices.length - 1]);
    } else if (entity.type === 'CIRCLE') {
      entity.edges = [];
      entity.edges.push({ x: entity.center.x + entity.radius, y: entity.center.y });
      entity.edges.push({ x: entity.center.x + entity.radius, y: entity.center.y });
    }
  });
}

interface Shape {
  entities: Entity[];
  start?: Vertice;
  end?: Vertice;
  perimeter?: number;
  area?: number;
  main?: boolean; // is main area
  closed: boolean; // is shape closed
  single: boolean; //is shape formed by single entity
  polygon?: any,
  skippedIncludesCheck?: boolean;
}

const EQUAL_TRESHOLD: number = 0.01;

function pointsAreEqual(p1: Vertice, p2: Vertice) {
  const delta: number = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
  return delta < EQUAL_TRESHOLD;
}

function swapEdges(entity: Entity) {
  const edgePoint: Vertice = entity.edges[0];
  entity.edges[0] = entity.edges[1];
  entity.edges[1] = edgePoint;
  entity.reverse = true;
}

function vectorAngle(p1: Vertice, p2: Vertice) {
  const angle: number = Math.acos((p2.x - p1.x)/lineLength(p1, p2));
  if (p2.y < p1.y) {
    return (2 * Math.PI) - angle;
  }
  return angle;
}

function cloneVertice(v: Vertice): Vertice {
  return {
    x: v.x,
    y: v.y,
    z: v.z,
    bulge: v.bulge,
  };
}

// split POLYLINE to arcs and lines
function transofrmEntity(entity: Entity): Entity[] {
  if (entity.type !== 'LWPOLYLINE') {
    return [entity];
  }
  let entities: Entity[] = [];

  entity.vertices.forEach((verticeParam: Vertice, index) => {
    if (!entity.vertices[index + 1]) {
      return;
    }
    const vertice = cloneVertice(verticeParam);
    const nextVertice: Vertice = cloneVertice(entity.vertices[index + 1]);
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
    const halfSegment: number = lineLength(vertice, nextVertice) / 2;
    const aGamma: number = ((Math.PI / 2) - 2 * Math.atan(Math.abs(vertice.bulge)));
    const radius: number = Math.abs(halfSegment / Math.cos(aGamma));
    const halfSegmentVertice: Vertice = { x: (vertice.x + nextVertice.x)/2, y: (vertice.y + nextVertice.y)/2 };
    const aBeta: number = vectorAngle(vertice, halfSegmentVertice);
    const centerAngle = aBeta + aGamma * Math.sign(vertice.bulge);
    const center: Vertice = {
      x: vertice.x + radius * Math.cos(centerAngle),
      y: vertice.y + radius * Math.sin(centerAngle),
    };

    let startAngle: number = vectorAngle(center, vertice);
    let endAngle: number = vectorAngle(center, nextVertice);

    const clockwise = Math.sign(vertice.bulge) === -1;

    const arc: Entity = {
      type: 'ARC',
      center,
      radius,
      startAngle,
      endAngle,
      edges: [vertice, nextVertice],
      clockwise,
      polyline: entity,
    };
    entities.push(arc);
  });

  if (entity.reverse) {
    entities = entities.reverse();
    entities.forEach((entity: Entity) => {
      swapEdges(entity);
    });
  }
  return entities;
}

interface UnknownEntities {
  [type: string]: number;
}

interface FindShapesResult {
  shapes: Shape[];
  unknownEntities: UnknownEntities;
}

function findShapes(data: DxfData): FindShapesResult {
  const shapes: Shape[] = [];
  const unknownEntities: UnknownEntities = {};
  const entities: Entity[] = data.entities.slice().filter((entity: Entity) => {
    if (!entity.edges) {
      const entitiesCount = unknownEntities[entity.type];
      unknownEntities[entity.type] = (entitiesCount || 0) + 1;
      return false;
    }
    return true;
  });
  while (entities.length) {
    const shape: Shape = {
      entities: [],
      closed: false,
      single: false,
    };
    const startEntity: Entity = entities.shift();
    shape.entities.push(...transofrmEntity(startEntity));
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

    let nextNotFound: boolean = false;
    while (!nextNotFound) {
      nextNotFound = true;
      for (let index in entities) {
        const entity: Entity = entities[index];
        if (entity.edges) {
          let entityMatches: boolean = false;
          if (pointsAreEqual(entity.edges[0], shape.start)) {
            entityMatches = true;
            swapEdges(entity);
            shape.entities.unshift(...transofrmEntity(entity));
            shape.start = entity.edges[0];
          } else if (pointsAreEqual(entity.edges[0], shape.end)) {
            entityMatches = true;
            shape.entities.push(...transofrmEntity(entity));
            shape.end = entity.edges[1];
          } else if (pointsAreEqual(entity.edges[1], shape.start)) {
            entityMatches = true;
            shape.entities.unshift(...transofrmEntity(entity));
            shape.start = entity.edges[0];
          } else if (pointsAreEqual(entity.edges[1], shape.end)) {
            entityMatches = true;
            swapEdges(entity);
            shape.entities.push(...transofrmEntity(entity));
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

  return { shapes, unknownEntities };
}

function toPoint(vertice: Vertice) {
  return new Point(vertice.x, vertice.y);
}

function createPolygon(shape: Shape) {
  const faces: any[] = [];
  shape.entities.forEach((entity: Entity) => {
    if (entity.type === 'LINE') {
      faces.push(new Segment(toPoint(entity.edges[0]), toPoint(entity.edges[1])));
    } else if (entity.type === 'ARC') {
      let arc = new Arc(toPoint(entity.center), entity.radius, entity.startAngle, entity.endAngle, !entity.clockwise );
      if (entity.reverse) {
        arc = arc.reverse();
      }
     faces.push(arc);
    } else if (entity.type === 'CIRCLE') {
      faces.push((new Circle(toPoint(entity.center), entity.radius)).toArc());
    } else {
      throw new Error('unknown entity');
    }
  });
  return new Polygon(faces);
}

const MAIN_INCLUDES_CHECK_TIMEOUT: number = 1 * 1000;
const CHECK_TIMEOUT_MESSAGE = 'check_timeout';

function findMainShape(shapes: Shape[]): Shape {
  if (shapes.length === 1) {
    return shapes[0];
  }
  let mainShapeIndex: number = -1;
  for (let i = 1; i < shapes.length; i++ ) {
    if (shapes[0].polygon.contains(shapes[i].polygon)) {
      mainShapeIndex = 0;
      break;
    }
    if (shapes[i].polygon.contains(shapes[0].polygon)) {
      mainShapeIndex = i;
      break;
    }
  }
  const mainShape: Shape = shapes.splice(mainShapeIndex, 1)[0];
  shapes.unshift(mainShape);
  // check all shapes inside main

  const started: number = new Date().getTime();
  try {
    shapes.forEach((shape: Shape, index: number) => {
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
  } catch (e) {
    if (e.message === CHECK_TIMEOUT_MESSAGE) {
      mainShape.skippedIncludesCheck = true;
    } else {
      throw e;
    }
  }

  return mainShape;
}

const MAX_BORDER_DISTANCE: number = 10000;

interface Rect {
  leftBottom: Vertice;
  rightTop: Vertice;
}

function findBounds(shape: Shape): Rect {
  if (!shape.polygon) {
    return null;
  }
  const topSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
  const distanceTop = shape.polygon.distanceTo(topSegment)[0];
  const bottomSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE));
  const distanceBottom = shape.polygon.distanceTo(bottomSegment)[0];
  const leftSegment = new Segment(new Point(-MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(-MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
  const distanceLeft = shape.polygon.distanceTo(leftSegment)[0];
  const rightSegment = new Segment(new Point(MAX_BORDER_DISTANCE, -MAX_BORDER_DISTANCE), new Point(MAX_BORDER_DISTANCE, MAX_BORDER_DISTANCE));
  const distanceRight = shape.polygon.distanceTo(rightSegment)[0];
  return {
    leftBottom: { x: distanceLeft - MAX_BORDER_DISTANCE, y: distanceBottom - MAX_BORDER_DISTANCE },
    rightTop: { x: MAX_BORDER_DISTANCE - distanceRight, y: MAX_BORDER_DISTANCE - distanceTop },
  }
}

function moveVertice(v: Vertice, dx: number, dy: number) {
  v.x = v.x + dx;
  v.y = v.y + dy;
}

function moveEntity(entity: Entity, bounds: Rect) {
  const dx: number = -bounds.leftBottom.x;
  const dy: number = -bounds.leftBottom.y;
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

interface ShapeData {
  area: number;
  perimeter: number;
}

interface FileData {
  area: number;
  perimeter: number;
  unknownEntities: UnknownEntities;
  errors: string[];
  splineExists: boolean;
  shapes: ShapeData[];
  width: number;
  height: number;
}

async function createSVG(filePath: string, shapes: Shape[], bounds: Rect) {

  const width: number = bounds.rightTop.x - bounds.leftBottom.x;
  const height: number = bounds.rightTop.y - bounds.leftBottom.y;

  shapes.forEach((shape: Shape) => {
    shape.entities.forEach(entity => moveEntity(entity, bounds));
    shape.polygon = createPolygon(shape);
  });

  const viewBox: number = Math.ceil(Math.max(width, height));
  const dy: number = (viewBox - height) / 2;
  const dx: number = (viewBox - width) / 2
  await fs.writeFile(filePath, `<?xml version="1.0" encoding="UTF-8"?>
    <svg id="stage" width="300" height="300" viewBox="0 0 ${viewBox} ${viewBox}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
      <g transform="scale(1,-1) translate(${dx}, ${dy - viewBox})">
        ${shapes.map(shape => shape.polygon.svg()).join('\r\n')}
      </g>
    </svg>
  `);

}

async function getFileData(filePath: string, svgPath?: string): Promise<FileData> {
  const data: DxfData = await readDxf(filePath);
  findEdges(data);
  const findShapesResult: FindShapesResult = findShapes(data);
  let shapes: Shape[] = findShapesResult.shapes;
  const fileData: FileData = {
    area: 0,
    perimeter: 0,
    unknownEntities: findShapesResult.unknownEntities,
    errors: [],
    splineExists: !!findShapesResult.unknownEntities.SPLINE,
    shapes: [],
    width: 0,
    height: 0,
  };

  shapes = shapes.filter((shape: Shape, index) => {
    try {
      shape.polygon = createPolygon(shape);
    } catch (e) {
      fileData.errors.push(`Shape ${index} has errors ${e.message}`);
      return false
    }
    if (!shape.polygon.isValid()) {
      fileData.errors.push(`Shape ${index} is invalid`);
    }
    try {
      shape.area = shape.polygon.area();
    } catch (e) {
      fileData.errors.push(`Can not compute area of the shape ${index}. ${e.message}`);
      return false;
    }
    try {
      shape.perimeter = shape.entities.reduce((acc, val) => {
        return acc + calcEntityLength(val);
      }, 0);
    } catch (e) {
      fileData.errors.push(`Can not compute perimeter of the shape ${index}. ${e.message}`);
      return false;
    }

    return true;
  });
  let mainShape: Shape;
  try {
    mainShape = findMainShape(shapes);
    fileData.area = mainShape.area;
  } catch (e) {
    fileData.errors.push('Can not define main shape');
    return fileData;
  }
  if (mainShape.skippedIncludesCheck) {
    fileData.errors.push('Skipped "all shapes in main shape" check');
  }
  fileData.perimeter = shapes.reduce((acc, val) => acc + val.perimeter, 0);
  fileData.shapes = shapes.map((shape) => ({
    area: shape.area,
    perimeter: shape.perimeter,
  }));

  const bounds: Rect = findBounds(mainShape);
  const width: number = bounds.rightTop.x - bounds.leftBottom.x;
  const height: number = bounds.rightTop.y - bounds.leftBottom.y;
  fileData.width = width;
  fileData.height = height;

  if (svgPath) {
    createSVG(svgPath, shapes, bounds);
  }

  return fileData;
}

const testData = {
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
    perimeter:  3349.694679,
  },
};

async function testSamples() {
  let err: boolean = false;
  const precision: number = 0.001;
  await Promise.all(Object.keys(testData).map(async (path: string) => {
    const data: FileData = await getFileData(path);
    if (data.shapes.length) {
      if (!testData[path].perimeter) {
        console.log(`${path} main perimeter ${data.shapes[0].perimeter}`);
      }
      if (testData[path].perimeter && (Math.abs(data.shapes[0].perimeter - testData[path].perimeter) > precision)) {
        err = true;
        console.log(`Test ${path} failed: perimeter!`, );
      }
    }
    if (testData[path].area && (Math.abs(data.area - testData[path].area) > precision)) {
      err = true;
      console.log(`Test ${path} failed: area!`);
    }
    if (testData[path].splineExists && !data.splineExists) {
      err = true;
      console.log(`Test ${path} failed!`);
    }
  }));
  if (!err) {
    console.log('Tests OK');
  }
}

async function demo() {
  await testSamples();
  await new Promise((resolve) => {
    setTimeout(() => {
      resolve(false);
    }, 1000);
  });
  const filename: string = 'samples\\sample.dxf';
  const data: DxfData = await readDxf(filename);

  findEdges(data);
  console.log('ents count:', data.entities.length, 'arcs', data.entities.filter(e => e.type === 'ARC').length);
  const findShapesResult = findShapes(data);
  console.log(findShapesResult.unknownEntities);
  let shapes = findShapesResult.shapes;
  console.log('shape count =', shapes.length);
  shapes = shapes.filter((shape: Shape, index) => {
    try {
      shape.polygon = createPolygon(shape);
    } catch (e) {
      console.log('shape', index, ' has err', e.message);
      return false;
    }
    if (!shape.polygon.isValid()) {
      // TODO: what does it actually mean?
    }
    return true;
  });
  const mainShape = findMainShape(shapes);

  console.log('got main shape, includes check skipped=', !!mainShape?.skippedIncludesCheck);
  mainShape.perimeter = mainShape.entities.reduce((acc, val) => {
    return acc + calcEntityLength(val);
  }, 0);
  const bounds: Rect = findBounds(mainShape);
  createSVG('sample.svg', shapes, bounds);
  console.log('main e=', mainShape.entities.length, ' a=', mainShape.polygon.area());
}

const DATA_FOLDER: string = 'data';
const SVG_FOLDER: string = 'svg';

async function processFile() {
  const pathIndex: number = process.argv.findIndex(arg => arg === '-f') + 1;
  const filePath: string = process.argv[pathIndex];
  const dir: string = path.dirname(filePath);
  const fileName: string = path.basename(filePath);

  const data: FileData = await getFileData(filePath, path.join(dir, SVG_FOLDER, fileName.replace('.dxf', '.svg')));
  await fs.writeFile(path.join(dir, DATA_FOLDER, fileName.replace('.dxf','.json')), JSON.stringify(data));
  console.log('SUCCESS');

}


if (process.argv.findIndex(arg => arg === '-test') > -1) {
  demo();
} else {
  processFile();
}

export {};
