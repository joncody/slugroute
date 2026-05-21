import { CONFIG } from './config.js';

/**
 * ColorManager assigns unique colors to each class number
 */
export const ColorManager = {
    assignments: {},

    getColor: function(classNumber) {
        if (ColorManager.assignments[classNumber]) {
            return ColorManager.assignments[classNumber];
        }

        const usedColors = Object.values(ColorManager.assignments);
        const nextColor = CONFIG.COLOR_POOL.find(function(c) {
            return !usedColors.includes(c);
        }) || CONFIG.COLOR_POOL[0];

        ColorManager.assignments[classNumber] = nextColor;
        return nextColor;
    },

    releaseColor: function(classNumber) {
        delete ColorManager.assignments[classNumber];
    }
};
