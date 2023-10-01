import { AbilityTemplateAdvanced } from "../ability-template";
import { ifDebug, localize } from '../../utils';
import HintHandler from "../../../view/hint-handler";

export class LineSystem extends AbilityTemplateAdvanced {
    /** @override */
    async commitPreview() {
        ifDebug(() => console.log(`inside ${this.constructor.name} - ${this.commitPreview.name}`));

        super.clearTargetIfEnabled();

        const targetConfig = {
            drawIcon: false,
            drawOutline: false,
        };

        this.document.angle = 90;

        const delta = canvas.grid.type > CONST.GRID_TYPES.SQUARE ? 30 : 15;

        HintHandler.show({ title: localize('rotation'), hint: localize('hints.mouseWheelRotate') });
        const updatePosition = async (crosshairs) => {

            let newDirection = 0;
            canvas.app.view.onwheel = (event) => {
                // Avoid rotation while zooming the browser window
                if (event.ctrlKey) {
                    event.preventDefault();
                }
                event.stopPropagation();

                const snap = event.shiftKey ? delta : 5;

                newDirection = this.document.direction + snap * Math.sign(event.deltaY);
            };

            while (crosshairs.inFlight) {
                await warpgate.wait(100);

                const { x, y } = crosshairs;
                if (this.document.direction === newDirection && x === this.document.x && y === this.document.y) {
                    continue;
                }

                this.document.direction = newDirection;
                this.document.x = crosshairs.x;
                this.document.y = crosshairs.y;
                this.refresh();

                super.targetIfEnabled();
            }

            canvas.app.view.onwheel = null;
        };

        const coneCrosshairs = await warpgate.crosshairs.show(
            targetConfig,
            {
                show: updatePosition
            }
        );

        if (coneCrosshairs.cancelled) {
            super.clearTargetIfEnabled();
            return false;
        }

        return true;
    }
}
