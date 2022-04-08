# dxf-handler

Parse DXF file, analyze and convert to SVG  

Script computes:
- area (for every shape and main shape)
- perimeter (for every shape and summary)
- width and height of bounding rectangle

Script creates SVG file

## Usage
1. Create folders `svg` and `data` in folder where `dxf` file located.
2. Run `dxf-handler` and specify source file with `-f` option:

````
node build\dxf-handler.js -f samples\sample2.dxf
````
Result:
- svg file will be placed in `svg` folder with the same name
- info json file will be places in `data` folder with the same name
