import { Dimensions } from 'react-native';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export const LOGO_FINAL_W = 1300;
export const LOGO_FINAL_H = 234;
export const LOGO_SMALL_SCALE = 200 / LOGO_FINAL_W;

const U_CENTER_SCALED = ((30.3115 + 55.5596) / 2) * (LOGO_FINAL_W / 200);
export const LOGO_TRANSLATE_X = LOGO_FINAL_W / 2 - U_CENTER_SCALED;
export const LOGO_TRANSLATE_Y = (SCREEN_HEIGHT + 60 - LOGO_FINAL_H / 2) - SCREEN_HEIGHT / 2;
