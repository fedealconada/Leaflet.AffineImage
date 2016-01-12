/*
 AffineImage Layer for leaflet, 
 Federico M Alconada Verzini, January , 2015

- added toolbox (GUI) to remove, save and adjust opacity  of the AffineImage layer
- fixed displaying marker on top of the AffineImage layer 
- inspired & portions taken from  :   
    * https://gist.github.com/Sumbera/11114288
    * https://github.com/thatjpk/LeafletAffineImageOverlay
*/


L.AffineImage = L.Class.extend({

    initialize: function (options) {
        this._hasToolbox = false;
        this._defaultGlobalAlpha = 0.7;
        L.setOptions(this, options);
    },

    params:function(options){
        L.setOptions(this, options);
        return this;
    },
    
    canvas: function () {
        return this._canvas;
    },

    redraw: function () {
        if (!this._frame) {
            this._frame = L.Util.requestAnimFrame(this._redraw, this);
        }
        return this;
    },
  
    onAdd: function (map) {
        this._map = map;
        this._canvas = L.DomUtil.create('canvas', 'leaflet-affineimage-layer');
        this._resizers = [];

        var size = this._map.getSize();
        this._canvas.width = size.x;
        this._canvas.height = size.y;

        var animated = this._map.options.zoomAnimation && L.Browser.any3d;
        L.DomUtil.addClass(this._canvas, 'leaflet-zoom-' + (animated ? 'animated' : 'hide'));


        map._panes.overlayPane.appendChild(this._canvas);

        map.on('moveend', this._reset, this);
        map.on('resize',  this._resize, this);

        if (map.options.zoomAnimation && L.Browser.any3d) {
            map.on('zoomanim', this._animateZoom, this);
        }

        this._addResizers();

        this._addToolbox();

        this._reset();
    },

    onRemove: function (map) {
        map.getPanes().overlayPane.removeChild(this._canvas);
 
        map.off('moveend', this._reset, this);
        map.off('resize', this._resize, this);

        if (map.options.zoomAnimation) {
            map.off('zoomanim', this._animateZoom, this);
        }
        this_canvas = null;

    },

    addTo: function (map) {
        map.addLayer(this);
        return this;
    },

    _resize: function (resizeEvent) {
        this._canvas.width  = resizeEvent.newSize.x;
        this._canvas.height = resizeEvent.newSize.y;
    },
    _reset: function () {
        var topLeft = this._map.containerPointToLayerPoint([0, 0]);
        L.DomUtil.setPosition(this._canvas, topLeft);
        this._redraw();
    },

    _redraw: function () {
        var size     = this._map.getSize();
        var bounds   = this._map.getBounds();
        var zoomScale = (size.x * 180) / (20037508.34  * (bounds.getEast() - bounds.getWest())); // resolution = 1/zoomScale
        var zoom = this._map.getZoom();
     
        // console.time('process');

        this._renderFunc(this,
                                {
                                    canvas   :this._canvas,
                                    bounds   : bounds,
                                    size     : size,
                                    zoomScale: zoomScale,
                                    zoom : zoom,
                                    globalAlpha : this._globalAlpha(),
                                    options: this.options
                               });
       
       
        // console.timeEnd('process');
        
        this._frame = null;
    },

    _animateZoom: function (e) {
        var scale = this._map.getZoomScale(e.zoom),
            offset = this._map._getCenterOffset(e.center)._multiplyBy(-scale).subtract(this._map._getMapPanePos());

        this._canvas.style[L.DomUtil.TRANSFORM] = L.DomUtil.getTranslateString(offset) + ' scale(' + scale + ')';

    },

    _renderFunc: function(params){
        var canvas = params._canvas;
        var ctx = canvas.getContext('2d');
        var image = params.options.image;
        var resizers = params._resizers;
        var width = canvas.width;
        var height = canvas.height;
        var globalAlpha = this._globalAlpha();

        ctx.save();
        ctx.clearRect(0, 0, width, height);
        var marker0 = this._latlngToContainerPoint(resizers[0].getLatLng());
        var marker1 = this._latlngToContainerPoint(resizers[1].getLatLng());
        var marker2 = this._latlngToContainerPoint(resizers[2].getLatLng());

        var m11 = (marker1.x - marker0.x) / image.width;
        var m12 = (marker1.y - marker0.y) / image.width;
        var m21 = (marker2.x - marker1.x) / image.height;
        var m22 = (marker2.y - marker1.y) / image.height;
        var dx = marker0.x;
        var dy = marker0.y;

        ctx.setTransform(
            m11, m12,
            m21, m22,
            dx,  dy
        );
        
        ctx.globalAlpha = globalAlpha;
        ctx.drawImage(image, 0,0);

        ctx.restore();

    },

    _addResizers: function() {
        var params = this.params();
        var mapSize = this._map.getSize().clone();
        var boundedMapSize = this._map.getSize().clone();
        var image = params.options.image;
        var imageSize = new L.Point(image.width, image.height);

        boundedMapSize.x *= params.options.boundingScale;
        boundedMapSize.y *= params.options.boundingScale;
        var xBoundingPad = (mapSize.x - boundedMapSize.x) / 2;
        var yBoundingPad = (mapSize.y - boundedMapSize.y) / 2;

        var mapAspectRatio = boundedMapSize.x / boundedMapSize.y;
        var imageAspectRatio = imageSize.x / imageSize.y;

        var xPad = 0;
        var yPad = 0;
        if (mapAspectRatio >= imageAspectRatio) {
            // Image taller than map per width, so pad x.
            var imageScale = boundedMapSize.y / imageSize.y;
            var scaledImageWidth = imageSize.x * imageScale;
            xPad = (boundedMapSize.x - scaledImageWidth) / 2;
        } else {
            // Image wider than map per height, so pad y.
            var imageScale = boundedMapSize.x / imageSize.x;
            var scaledImageHeight = imageSize.y * imageScale;
            yPad = (boundedMapSize.y - scaledImageHeight) / 2;
        }

        var north = yBoundingPad + yPad;
        var south = mapSize.y - (yBoundingPad + yPad);
        var west = xBoundingPad + xPad;
        var east = mapSize.x -  (xBoundingPad + xPad);

        var nw = new L.Point(west, north);
        var ne = new L.Point(east, north);
        var se = new L.Point(east, south);
        
        //Creating resizers...
        var mnw = this._createMarkerAtContainerPoint(nw);
        var mne = this._createMarkerAtContainerPoint(ne);
        var mse = this._createMarkerAtContainerPoint(se);

        //Changing resizers' icons
        var resizerIcon = L.icon({
            iconUrl: './img/resizer.png',
            iconSize: [30, 30],
            iconAnchor: [10, 10],
        });
        mnw.setIcon(resizerIcon);
        mne.setIcon(resizerIcon);
        mse.setIcon(resizerIcon);

        this._resizers.length=0;
        this._resizers.push(mnw);
        this._resizers.push(mne);
        this._resizers.push(mse);
        var resizersLayer = new L.LayerGroup();
        for (i in this._resizers) {
            resizersLayer.addLayer(this._resizers[i]);
        }
        this._map.addLayer(resizersLayer);

        this._resizersLayer = resizersLayer;

        imageLocations = [];
        imageLocations.push([0,0]);
        imageLocations.push([image.width, 0]);
        imageLocations.push([image.width, image.height]);

        //setup listener for each resizer
        var layer = this;
        for (i = 0; i < this._resizers.length; i++) {
            this._resizers[i].on('drag', function(){
                layer._renderFunc(params);
            });
        }
        
        return this._resizers;
    },

    _addToolbox: function(){
        var params = this.params();

        this._toolbox = new L.Control.AffineToolbox(this);
        this._hasToolbox = true;
        this._toolbox.addTo(this._map);
        
        //Setting up render function to slider
        var slider = this._toolbox.slider();
        

        $(slider).on("slide", $.proxy(function () {
             this._renderFunc(params);
         },this));

    },

    _removeToolbox: function(){
        this._map.removeControl(this._toolbox);
    },

    _globalAlpha: function(){
        if (this._hasToolbox){
            return $("#opacity-slider").slider( "option", "value" )/100;
        }else{
            return this._defaultGlobalAlpha;
        }
    },

    // Converts a latlng on the world to a pixel coordinate in the map's div.
    _latlngToContainerPoint: function(latlng) {
        var pixel_on_world = this._map.latLngToLayerPoint(latlng);
        var pixel_in_container = this._map.layerPointToContainerPoint(pixel_on_world);
        return pixel_in_container;
    },

    // Converts a pixel coordinate in the map's div to a latlng on the world.
    _containerPointToLatlng: function(containerPoint) {
        var pixelOnWorld = this._map.containerPointToLayerPoint(containerPoint);
        var latlng = this._map.layerPointToLatLng(pixelOnWorld);
        return latlng;
    },

    // Returns a marker object at the given container location
    _createMarkerAtContainerPoint: function(container_point) {
        var latlng = this._containerPointToLatlng(container_point);
        return new L.Marker(latlng, {
            draggable: true,
        });
    }

});

L.affineImage = function (options) {
    return new L.AffineImage(options);
};