import { MODULE_NAME } from '../consts';
import { CirclePlacement } from './template-placement/circles/circle-placement';
import { ifDebug } from './utils';

const hideControlIconKey = 'hideControlIconKey';

const initMeasuredTemplate = () => {
    ifDebug(() => console.log('init measured template override'));
    const MeasuredTemplatePF = CONFIG.MeasuredTemplate.objectClass;

    class MeasuredTemplatePFAdvanced extends MeasuredTemplatePF {
        get shouldOverrideIcon() {
            return !!this.data.flags?.[MODULE_NAME]?.[hideControlIconKey];
        }

        // todo read game setting to see if medium or smaller tokens are forced to pick a corner of their square to center from
        get tokenEmanationSize() {
            // eslint-disable-next-line
            return false ? 1 : -1;
        }

        get shouldOverrideTokenEmanation() {
            return game.settings.get('pf1', 'measureStyle')
                && this.data.t === 'circle'
                && this.data.flags?.[MODULE_NAME]?.[CirclePlacement.placementKey] === 'self'
                && ['burst', 'emanation'].includes(this.data.flags?.[MODULE_NAME]?.[CirclePlacement.areaTypeKey])
                && this.tokenSizeSquares.sizeSquares > this.tokenEmanationSize;
        }

        get tokenSizeSquares() {
            const tokenId = this.data.flags?.[MODULE_NAME]?.tokenId;
            const token = canvas.tokens.placeables.find((x) => x.id === tokenId);
            const sizeSquares = token?.data.width || 1;
            return { token, sizeSquares };
        }

        get tokenGridCorners() {
            const { token, sizeSquares } = this.tokenSizeSquares;
            const { x, y } = token;
            const gridSize = canvas.grid.h;

            const bottom = y + gridSize * sizeSquares;
            const left = x;
            const top = y;
            const right = x + gridSize * sizeSquares;

            const rightSpots = [...new Array(sizeSquares + 1)].map((_, i) => ({
                x: right,
                y: top + gridSize * i,
            }));
            const bottomSpots = [...new Array(sizeSquares + 1)].map((_, i) => ({
                x: right - gridSize * i,
                y: bottom,
            }));
            bottomSpots.shift();
            bottomSpots.pop();
            const leftSpots = [...new Array(sizeSquares + 1)].map((_, i) => ({
                x: left,
                y: bottom - gridSize * i,
            }));
            const topSpots = [...new Array(sizeSquares + 1)].map((_, i) => ({
                x: left + gridSize * i,
                y: top,
            }));
            topSpots.shift();
            topSpots.pop();

            const allSpots = [
                ...rightSpots,
                ...bottomSpots,
                ...leftSpots,
                ...topSpots,
            ];

            return allSpots;
        }

        _getEmanationShape() {
            const { sizeSquares } = this.tokenSizeSquares;

            const dimensions = canvas.dimensions;
            let { distance: radius } = this.data;
            radius *= (dimensions.size / dimensions.distance);
            radius += dimensions.size * sizeSquares / 2;
            this.shape = new PIXI.RoundedRectangle(-radius, -radius, radius * 2, radius * 2, radius - dimensions.size * sizeSquares / 2);
        }

        /** @override */
        refresh() {
            if (!this.shouldOverrideIcon && !this.shouldOverrideTokenEmanation) {
                return super.refresh();
            }

            /* ALL OF THIS IS THE ORIGINAL METHOD EXCEPT FOR THE PARTS IN MY IF(SHOULDOVERRIDE) BLOCKS */
            const d = canvas.dimensions;
            this.position.set(this.data.x, this.data.y);

            // Extract and prepare data
            let { direction, distance, width } = this.data;
            distance *= (d.size / d.distance);
            width *= (d.size / d.distance);
            direction = Math.toRadians(direction);
            if (this.shouldOverrideTokenEmanation) {
                const { sizeSquares } = this.tokenSizeSquares;
                distance += d.size * sizeSquares / 2;
            }

            // Create ray and bounding rectangle
            this.ray = Ray.fromAngle(this.data.x, this.data.y, direction, distance);

            // Get the Template shape
            switch (this.data.t) {
                case 'circle':
                    this.shape = this._getCircleShape(distance);
                    break;
                case 'cone':
                    this.shape = this._getConeShape(direction, this.data.angle, distance);
                    break;
                case 'rect':
                    this.shape = this._getRectShape(direction, distance);
                    break;
                case 'ray':
                    this.shape = this._getRayShape(direction, distance, width);
                    break;
            }
            if (this.shouldOverrideTokenEmanation) {
                this._getEmanationShape();
            }

            // Draw the Template outline
            this.template.clear().lineStyle(this._borderThickness, this.borderColor, 0.75).beginFill(0x000000, 0.0);

            // Fill Color or Texture
            if (this.texture) {
                this.template.beginTextureFill({
                    texture: this.texture
                });
            }
            else {
                this.template.beginFill(0x000000, 0.0);
            }

            // Draw the shape
            this.template.drawShape(this.shape);

            // Draw origin and destination points
            this.template.lineStyle(this._borderThickness, 0x000000)
                .beginFill(0x000000, 0.5)
                .drawCircle(0, 0, 6)
                .drawCircle(this.ray.dx, this.ray.dy, 6);

            // Update the HUD
            if (this.shouldOverrideIcon) {
                this.hud.icon.interactive = false;
                this.hud.icon.border.visible = false;
            }
            else {
                this.hud.icon.visible = this.layer._active;
                this.hud.icon.border.visible = this._hover;
            }

            this._refreshRulerText();

            return this;
        }

        /** @override */
        getHighlightedSquares() {
            if (!this.shouldOverrideTokenEmanation) {
                return super.getHighlightedSquares();
            }

            if (!this.id || !this.shape) {
                return [];
            }

            const { token, sizeSquares } = this.tokenSizeSquares;
            if (!token || sizeSquares < 2) {
                return super.getHighlightedSquares();
            }

            const grid = canvas.grid;
            const d = canvas.dimensions;

            // Get number of rows and columns
            const nr = Math.ceil((this.data.distance * 1.5) / d.distance / (d.size / grid.h));
            const nc = Math.ceil((this.data.distance * 1.5) / d.distance / (d.size / grid.w));

            // Get the center of the grid position occupied by the template
            const result = [];

            let origins = this.tokenGridCorners;
            // offset origins to template center to account for token movement
            origins = origins.map(({ x, y }) => ({
                x: x + this.center.x - token.center.x,
                y: y + this.center.y - token.center.y,
            }));

            origins.forEach(({ x, y }) => {
                const [cx, cy] = grid.getCenter(x, y);
                const [col0, row0] = grid.grid.getGridPositionFromPixels(cx, cy);

                const measureDistance = function (p0, p1) {
                    const gs = canvas.dimensions.size;
                    const ray = new Ray(p0, p1);
                    // How many squares do we travel across to get there? If 2.3, we should count that as 3 instead of 2; hence, Math.ceil
                    const nx = Math.ceil(Math.abs(ray.dx / gs));
                    const ny = Math.ceil(Math.abs(ray.dy / gs));

                    // Get the number of straight and diagonal moves
                    const nDiagonal = Math.min(nx, ny);
                    const nStraight = Math.abs(ny - nx);

                    // Diagonals in PF pretty much count as 1.5 times a straight
                    const distance = Math.floor(nDiagonal * 1.5 + nStraight);
                    const distanceOnGrid = distance * canvas.dimensions.distance;
                    return distanceOnGrid;
                };

                for (let a = -nc; a < nc; a++) {
                    for (let b = -nr; b < nr; b++) {
                        // Position of cell's top-left corner, in pixels
                        const [gx, gy] = canvas.grid.grid.getPixelsFromGridPosition(col0 + a, row0 + b);
                        // Position of cell's center, in pixels
                        const [cellCenterX, cellCenterY] = [gx + d.size * 0.5, gy + d.size * 0.5];

                        // Determine point of origin
                        const origin = { x, y };

                        // Determine point we're measuring the distance to - always in the center of a grid square
                        const destination = { x: cellCenterX, y: cellCenterY };

                        const distance = measureDistance(destination, origin);
                        if (distance <= this.data.distance) {
                            result.push({ x: gx, y: gy });
                        }
                    }
                }
            });

            const filtered = [...(new Set(result.map(JSON.stringify)))].map(JSON.parse);
            return filtered;
        }
    }

    CONFIG.MeasuredTemplate.objectClass = MeasuredTemplatePFAdvanced;

    class AbilityTemplateAdvanced extends MeasuredTemplatePFAdvanced {
        static fromData(templateData) {
            const { type, distance } = templateData;
            if (!type
                || !distance
                || !canvas.scene
                || !["cone", "circle"].includes(type)
            ) {
                return null;
            }

            // Return the template constructed from the item data
            const cls = CONFIG.MeasuredTemplate.documentClass;
            const template = new cls(templateData, { parent: canvas.scene });

            // todo do I need to initialize specific measured template type variables here?

            const thisTemplate = new this(template);
            return thisTemplate;
        }

        async drawPreview() {
            const initialLayer = canvas.activeLayer;
            await this.draw();
            this.active = true;
            this.layer.activate();
            this.layer.preview.addChild(this);

            const finalized = await this.commitPreview();

            this.active = false;
            const hl = canvas.grid.getHighlightLayer(`Template.${this.id}`);
            hl.clear();

            this.destroy();
            initialLayer.activate();

            return finalized
                ? {
                    result: true,
                    place: async () => {
                        const doc = (await canvas.scene.createEmbeddedDocuments("MeasuredTemplate", [this.data.toObject()]))[0];
                        this.document = doc;
                        return doc;
                    },
                    delete: () => {
                        return this.document.delete();
                    },

                }
                : { result: false };
        }

        refresh() {
            if (!this.template || !canvas.scene) {
                return;
            }

            super.refresh();

            if (this.active) {
                this.highlightGrid();
            }

            return this;
        }


        /**
         * returns { result: boolean, place: () => {} (places template), delete: () => {} (deletes template) }
         */
        async commitPreview() { }
    }

    class AbilityTemplateCircleSelf extends AbilityTemplateAdvanced {
        async commitPreview() {

        }
    }

    class AbilityTemplateCircle extends AbilityTemplateAdvanced {
        async commitPreview() {

        }
    }

    class AbilityTemplateConeSelf15 extends AbilityTemplateAdvanced {
        async commitPreview() {

        }
    }

    class AbilityTemplateConeSelf extends AbilityTemplateAdvanced {
        async commitPreview() {

        }
    }

    class AbilityTemplateConeTarget extends AbilityTemplateAdvanced {
        async commitPreview() {

        }
    }

    game[MODULE_NAME] = {
        AbilityTemplateCircle,
        AbilityTemplateCircleSelf,
        AbilityTemplateConeSelf,
        AbilityTemplateConeSelf15,
        AbilityTemplateConeTarget,
        MeasuredTemplatePFAdvanced,
    };
};

export {
    hideControlIconKey,
    initMeasuredTemplate,
};
