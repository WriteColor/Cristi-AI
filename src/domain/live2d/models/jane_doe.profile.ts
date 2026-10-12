import type { ModelProfile } from '../types';

/**
 * Live2D Model Profile: Jane Doe (ZZZ) (jane_doe)
 * Generated with dynamic capability introspection
 */

export const jane_doeProfile: ModelProfile = {
  id: 'jane_doe',
  name: 'Jane Doe (ZZZ)',
  character: 'Jane Doe',
  theme: 'Rat Thiren / Zenless Zone Zero',
  badge: 'ZZZ',
  recommendedVoice: 'Kore',
  description: 'Agente Thiren de ZZZ con 236 parámetros, expresiones de corazón, lágrimas, estrellas y gestos manuales.',
  path: '/models/live2d/jane_doe/简.model3.json',
  
  capabilities: {
    "facialExpressions": true,
    "eyeBlink": true,
    "eyeTracking": true,
    "mouthControl": true,
    "headMovement": true,
    "bodyMovement": false,
    "armMovement": true,
    "breathing": true,
    "physics": true,
    "customExpressions": [
        "右手",
        "左手",
        "星星眼",
        "泪",
        "爱心眼",
        "生气",
        "白眼",
        "脸红",
        "脸黑",
        "血"
    ],
    "motions": [
        "Scene1"
    ],
    "totalParameters": 236
},
  
  standardMapping: {
    "head_angle_x": "ParamAngleX",
    "head_angle_y": "ParamAngleY",
    "head_angle_z": "ParamAngleZ",
    "eye_l_open": "ParamEyeLOpen",
    "eye_r_open": "ParamEyeROpen",
    "eye_l_smile": "ParamEyeLSmile",
    "eye_r_smile": "ParamEyeRSmile",
    "eye_ball_x": "ParamEyeBallX",
    "eye_ball_y": "ParamEyeBallY",
    "brow_l_y": "ParamBrowLY",
    "brow_r_y": "ParamBrowRY",
    "mouth_open_y": "ParamMouthOpenY",
    "mouth_form": "ParamMouthForm",
    "breath": "ParamBreath"
},
  
  semanticActions: {
    "idle": {
        "type": "parameters",
        "targets": {}
    },
    "happy": {
        "type": "parameters",
        "targets": {
            "ParamEyeLSmile": 1.0,
            "ParamEyeRSmile": 1.0,
            "ParamMouthForm": 1.0
        }
    },
    "blush": {
        "type": "expression",
        "name": "脸红"
    },
    "yandere": {
        "type": "expression",
        "name": "脸黑"
    },
    "wink": {
        "type": "parameters",
        "targets": {
            "ParamEyeROpen": 0.0,
            "ParamEyeRSmile": 1.0
        }
    },
    "surprised": {
        "type": "expression",
        "name": "星星眼"
    },
    "sad": {
        "type": "expression",
        "name": "泪"
    },
    "angry": {
        "type": "expression",
        "name": "生气"
    },
    "love": {
        "type": "expression",
        "name": "爱心眼"
    }
}
};

export default jane_doeProfile;
