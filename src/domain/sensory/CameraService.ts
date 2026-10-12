/**
 * Cristi AI - Sensory Vision & Camera Service (TypeScript)
 * Supports standard webcams, Windows Hello IR (Infrared) cameras, device enumeration,
 * dynamic sensor switching and image preprocessing.
 */

export interface VideoDeviceInfo {
  deviceId: string;
  label: string;
  isIR: boolean;
}

export interface CameraServiceOptions {
  onFrameCaptured?: (base64: string) => void;
  onFrame?: (base64: string) => void;
  onError?: (error: unknown) => void;
}

export class CameraService {
  public onFrameCaptured: (base64: string) => void;
  public onError: (error: unknown) => void;

  public mediaStream: MediaStream | null = null;
  public videoElement: HTMLVideoElement | null = null;
  public internalVideoElement: HTMLVideoElement | null = null;
  public canvasElement: HTMLCanvasElement | null = null;
  public canvasCtx: CanvasRenderingContext2D | null = null;
  public isStreaming = false;
  private intervalId: ReturnType<typeof setTimeout> | null = null;
  public streamFps = 1;
  public currentDeviceId: string | null = null;
  public isIREnhancementEnabled = false;
  private _isStarting = false;

  constructor({ onFrameCaptured, onFrame, onError }: CameraServiceOptions = {}) {
    this.onFrameCaptured = onFrameCaptured || onFrame || (() => {});
    this.onError = onError || console.error;
  }

  /**
   * Enumerate all connected cameras and identify Windows Hello / IR sensors
   */
  public static async getAvailableDevices(): Promise<VideoDeviceInfo[]> {
    try {
      if (!navigator?.mediaDevices?.enumerateDevices) return [];
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter((d) => d.kind === 'videoinput');

      return videoDevices.map((d, index) => {
        const labelLower = (d.label || '').toLowerCase();
        const isIR =
          labelLower.includes('ir') ||
          labelLower.includes('infrared') ||
          labelLower.includes('hello') ||
          labelLower.includes('realsense') ||
          labelLower.includes('depth') ||
          labelLower.includes('sensor');

        return {
          deviceId: d.deviceId,
          label: d.label || `Cámara #${index + 1}`,
          isIR
        };
      });
    } catch (e) {
      console.error('Error al enumerar dispositivos de video:', e);
      return [];
    }
  }

  public static async getAvailableVideoDevices(): Promise<VideoDeviceInfo[]> {
    return await this.getAvailableDevices();
  }

  public async start(videoPreviewElement: HTMLVideoElement | null = null, preferredDeviceId: string | null = null): Promise<void> {
    if (this.isStreaming && this.currentDeviceId === preferredDeviceId && (this.videoElement || this.internalVideoElement)) {
      if (videoPreviewElement && this.videoElement !== videoPreviewElement) {
        this.attachVideoPreview(videoPreviewElement);
      }
      return;
    }

    if (this.isStreaming || this._isStarting) {
      this.stop();
    }

    this._isStarting = true;

    try {
      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 24 }
      };

      if (preferredDeviceId) {
        videoConstraints.deviceId = { ideal: preferredDeviceId };
      } else {
        videoConstraints.facingMode = 'user';
      }

      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: false
        });
      } catch (constraintErr) {
        console.warn('getUserMedia con constraints específicos falló, reintentando con fallback básico:', constraintErr);
        stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
      }

      // If stop() was called while acquiring the stream, release hardware immediately
      if (!this._isStarting) {
        if (stream) {
          stream.getTracks().forEach((track) => {
            try { track.stop(); } catch (_) {}
          });
        }
        return;
      }

      this.mediaStream = stream;
      this.currentDeviceId = preferredDeviceId;

      // Maintain an internal offscreen video element for headless reliability
      if (!this.internalVideoElement) {
        this.internalVideoElement = document.createElement('video');
        this.internalVideoElement.autoplay = true;
        this.internalVideoElement.playsInline = true;
        this.internalVideoElement.muted = true;
      }
      this.internalVideoElement.srcObject = this.mediaStream;
      try {
        await this.internalVideoElement.play();
      } catch (playErr) {
        console.warn('Autoplay aviso elemento offscreen:', playErr);
      }

      if (videoPreviewElement) {
        this.attachVideoPreview(videoPreviewElement);
      } else {
        this.videoElement = this.internalVideoElement;
      }

      if (!this.canvasElement) {
        this.canvasElement = document.createElement('canvas');
        this.canvasElement.width = 640;
        this.canvasElement.height = 480;
        this.canvasCtx = this.canvasElement.getContext('2d');
      }

      this.isStreaming = true;
    } catch (err) {
      this.onError(err);
      this.stop();
      throw err;
    } finally {
      this._isStarting = false;
    }
  }

  public attachVideoPreview(videoElement: HTMLVideoElement | null): void {
    if (!videoElement) return;
    this.videoElement = videoElement;
    if (this.mediaStream && videoElement.srcObject !== this.mediaStream) {
      videoElement.srcObject = this.mediaStream;
      videoElement.play?.().catch((e) => console.warn('Preview video play notice:', e));
    }
  }

  public getVideoElement(): HTMLVideoElement | null {
    return this.videoElement || this.internalVideoElement;
  }

  public getMediaStream(): MediaStream | null {
    return this.mediaStream;
  }

  public setIREnhancement(enabled: boolean): void {
    this.isIREnhancementEnabled = enabled;
  }

  public startPeriodicStreaming(fps = 1): void {
    this.streamFps = fps;
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
    }

    const intervalMs = Math.round(1000 / fps);
    let inFlight = false;
    const capture = (): void => {
      if (!this.isStreaming) return;
      if (!inFlight) {
        inFlight = true;
        try {
          const frameBase64 = this.captureFrameJPEG();
          if (frameBase64) this.onFrameCaptured(frameBase64);
        } finally {
          inFlight = false;
        }
      }
      if (this.isStreaming) {
        this.intervalId = setTimeout(capture, intervalMs);
      }
    };
    this.intervalId = setTimeout(capture, 0);
  }

  public stopPeriodicStreaming(): void {
    if (this.intervalId !== null) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }

  public captureFrameJPEG(): string | null {
    const video = this.getVideoElement();
    if (!this.isStreaming || !video || !this.canvasCtx || !this.canvasElement) return null;
    if (video.readyState < 2) return null;

    try {
      const vw = video.videoWidth || 640;
      const vh = video.videoHeight || 480;
      if (this.canvasElement.width !== vw || this.canvasElement.height !== vh) {
        this.canvasElement.width = vw;
        this.canvasElement.height = vh;
      }

      this.canvasCtx.drawImage(
        video,
        0,
        0,
        this.canvasElement.width,
        this.canvasElement.height
      );

      if (this.isIREnhancementEnabled) {
        const imgData = this.canvasCtx.getImageData(0, 0, this.canvasElement.width, this.canvasElement.height);
        const data = imgData.data;
        for (let i = 0; i < data.length; i += 4) {
          data[i] = Math.min(255, data[i] * 1.25);
          data[i + 1] = Math.min(255, data[i + 1] * 1.25);
          data[i + 2] = Math.min(255, data[i + 2] * 1.25);
        }
        this.canvasCtx.putImageData(imgData, 0, 0);
      }

      const dataUrl = this.canvasElement.toDataURL('image/jpeg', 0.65);
      const base64Data = dataUrl.split(',')[1];
      return base64Data || null;
    } catch (e) {
      console.error('Error al capturar frame JPEG:', e);
      return null;
    }
  }

  public stop(): void {
    this._isStarting = false;
    this.stopPeriodicStreaming();
    this.isStreaming = false;

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => {
        try {
          track.stop();
        } catch (_) {}
      });
      this.mediaStream = null;
    }

    if (this.videoElement && this.videoElement !== this.internalVideoElement) {
      this.videoElement.srcObject = null;
    }
    if (this.internalVideoElement) {
      this.internalVideoElement.srcObject = null;
      try {
        this.internalVideoElement.pause();
      } catch (_) {}
    }
    this.videoElement = null;

    if (this.canvasCtx && this.canvasElement) {
      try {
        this.canvasCtx.clearRect(0, 0, this.canvasElement.width, this.canvasElement.height);
      } catch (_) {}
    }
  }
}

export default CameraService;
