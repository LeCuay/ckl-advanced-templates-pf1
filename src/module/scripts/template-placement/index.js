import { CONSTS, MODULE_NAME } from '../../consts';
import { getToken, ifDebug, localize } from '../utils';
import { Settings } from '../../settings';
import { calculateExpiration } from './calculate-expiration';

const ignoreRangeKey = 'ignore-range';
const addSkipRangeToDialog = (dialog, [html], data) => {
    if (dialog instanceof pf1.applications.AttackDialog
        && !!data.action.data.measureTemplate?.type
    ) {
        const form = html.querySelector('form');

        const container = document.createElement('div');
        container.classList.add('form-group', 'stacked', 'flags', 'advanced-templates');

        {
            // container label
            const label = document.createElement('label');
            label.innerText = localize('advanced-templates');
            container.appendChild(label);
        }

        {
            // ignore range checkbox
            const label = document.createElement('label');
            label.classList.add('checkbox');

            const input = document.createElement('input');
            input.setAttribute('type', 'checkbox');
            input.setAttribute('name', ignoreRangeKey);

            label.textContent = ` ${localize('templates.ignoreRange')} `;
            label.insertBefore(input, label.firstChild);
            container.appendChild(label);
        }

        form.lastElementChild.before(container);
        dialog.setPosition();
    }
}

/**
 * Common logic and switch statement for placing all templates
 *
 * @this {ActionUse}
 * @param {object} shared The shared context passed between different functions when executing an Attack
 *
 * @returns {object} The template creation data
 */
async function promptMeasureTemplate() {
    ifDebug(() => console.log('promptMeasureTemplate', this));

    // return success early if user isn't allowed to place templates
    if (!hasTemplatePermission()) {
        return {
            delete: () => { },
            place: () => { },
            result: true,
        };
    }

    const type = this.shared.action.data.measureTemplate.type;

    const actor = this.item?.actor;
    const token = getToken(this.item) || {};
    const icon = this.shared.action.data.img === 'systems/pf1/icons/misc/magic-swirl.png' ? this.item.img : this.shared.action.data.img;
    let { maxRange, minRange } = this.shared.action;
    const flags = this.shared.action.data.flags?.[MODULE_NAME] || {};
    let distance = _getSize(this.shared) || 5;

    const expirationTime = calculateExpiration(this.getRollData(), flags);

    const templateData = {
        _id: randomID(16),
        distance,
        t: type,
        flags: {
            [MODULE_NAME]: {
                ...flags,
                [CONSTS.flags.circle.movesWithToken]: flags[CONSTS.flags.placementType] == CONSTS.placement.circle.self && !!flags[CONSTS.flags.circle.movesWithToken],
                [CONSTS.flags.expirationTime]: expirationTime,
                [CONSTS.flags.ignoreRange]: flags[CONSTS.flags.ignoreRange] || !!this.formData[ignoreRangeKey],
                baseDistance: distance,
                icon,
                itemId: this.item?.id,
                maxRange,
                minRange,
                tokenId: token?.id,
            },
        },
        user: game.userId,
        fillColor: this.shared.action.data.measureTemplate.color || game.user.color,
        texture: this.shared.action.data.measureTemplate.texture || null,
    };

    if (['ray', 'line'].includes(type)) {
        templateData.width = flags[CONSTS.flags.line.widthOverride] && flags[CONSTS.flags.line.width] || Settings.defaultLineWidth;
    }

    const windows = Object.values(ui.windows).filter((x) => !!x.minimize && !x._minimized && !isSimpleCalender(x));
    await Promise.all(windows.map((x) => x.minimize()));

    const template = await game.modules.get(MODULE_NAME).api.AbilityTemplateAdvanced.fromData(templateData, this.shared.action);
    if (!template) {
        return { result: false };
    }

    const result = await template.drawPreview();

    if (!result.result) {
        await Promise.all(windows.map((x) => x.maximize()));
        return result;
    }

    if (Settings.reExpand) {
        await Promise.all(windows.map((x) => x.maximize()));
    }

    this.shared.template = await result.place();

    return result;
}

export {
    addSkipRangeToDialog,
    promptMeasureTemplate,
};

const _getSize = (shared) => pf1.utils.convertDistance(RollPF.safeTotal(shared.action.data.measureTemplate.size, shared.rollData))[0];

const hasTemplatePermission = () => game.permissions.TEMPLATE_CREATE.includes(game.user.role);

const isSimpleCalender = (x) => !!x.activeCalendar;
