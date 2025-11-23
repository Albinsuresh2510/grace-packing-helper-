
import React, { useRef, useState, useEffect } from 'react';
import { X, Zap, ZapOff, RefreshCw, Check, Grid3x3, AlertTriangle, Layers, Camera as CameraIcon } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface CameraCaptureProps {
  onCapture: (file: File) => void;
  onClose: () => void;
}

const CameraCapture: React.FC<CameraCaptureProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [errorType, setErrorType] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isFlashSupported, setIsFlashSupported] = useState(false);
  const [flashOn, setFlashOn] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [sessionCount, setSessionCount] = useState(0);
  const [showSavedToast, setShowSavedToast] = useState(false);

  // Initialize Camera with Fallback Logic
  useEffect(() => {
    let currentStream: MediaStream | null = null;
    let mounted = true;

    const startCamera = async (useFallback = false) => {
      setErrorType(null);
      try {
        const constraints: MediaStreamConstraints = useFallback 
          ? { video: true } 
          : {
              video: {
                facingMode: 'environment', // Prefer rear camera
                width: { ideal: 1920 }, // Ideal but not mandatory
                height: { ideal: 1080 }
              }
            };
        
        console.log(`Requesting camera (Fallback: ${useFallback})...`);
        const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        if (!mounted) {
            mediaStream.getTracks().forEach(t => t.stop());
            return;
        }

        currentStream = mediaStream;
        setStream(mediaStream);
        
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        // Check for Flash (Torch) support
        const track = mediaStream.getVideoTracks()[0];
        const capabilities = (track.getCapabilities && track.getCapabilities()) || {};
        // @ts-ignore - torch is not strictly typed in all envs
        if (capabilities.torch) {
          setIsFlashSupported(true);
        }

      } catch (err: any) {
        console.warn("Camera Start Error:", err.name, err);
        
        if (!mounted) return;

        // Smart Fallback
        if (!useFallback) {
             // If constraints failed or any other error, try basic constraints once
             console.log("Attempting fallback to basic constraints...");
             startCamera(true);
             return;
        }

        // If fallback failed, categorize error
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
             setErrorType('permission');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
             setErrorType('no-device');
        } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
             setErrorType('in-use');
        } else {
             setErrorType('unknown');
        }
      }
    };

    startCamera();

    return () => {
      mounted = false;
      if (currentStream) {
        currentStream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Toggle Flash
  const toggleFlash = async () => {
    if (!stream || !isFlashSupported) return;
    const track = stream.getVideoTracks()[0];
    try {
      await track.applyConstraints({
        // @ts-ignore
        advanced: [{ torch: !flashOn }]
      });
      setFlashOn(!flashOn);
    } catch (e) {
      console.error("Flash toggle error", e);
    }
  };

  // Capture Photo
  const handleCapture = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
        setCapturedImage(dataUrl);
      }
    }
  };

  // Process dataURL to File
  const processImage = (dataUrl: string, cb: (file: File) => void) => {
      fetch(dataUrl)
        .then(res => res.blob())
        .then(blob => {
          const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
          cb(file);
        });
  };

  // Save and Close
  const handleSaveAndClose = () => {
    if (capturedImage) {
        processImage(capturedImage, (file) => {
            onCapture(file);
            onClose();
        });
    }
  };

  // Save and Next (Batch Mode)
  const handleSaveAndNext = () => {
    if (capturedImage) {
        processImage(capturedImage, (file) => {
            onCapture(file);
            setSessionCount(prev => prev + 1);
            setShowSavedToast(true);
            setTimeout(() => setShowSavedToast(false), 2000);
            retake(); // Instant reset
        });
    }
  };

  // Retake
  const retake = () => {
    setCapturedImage(null);
  };

  if (errorType) {
     return (
         <div className="fixed inset-0 z-[200] bg-gray-900 flex flex-col items-center justify-center p-6 text-white text-center">
             <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 text-red-500 ring-4 ring-red-500/10">
                <AlertTriangle size={40} />
             </div>
             
             {errorType === 'permission' && (
                 <>
                    <h2 className="text-2xl font-black mb-3">Camera Access Denied</h2>
                    <p className="text-gray-400 mb-6 max-w-xs leading-relaxed">
                        Please enable camera permissions in your browser settings.
                    </p>
                    <div className="bg-gray-800 p-4 rounded-xl text-left text-sm text-gray-300 w-full max-w-xs space-y-2 mb-8 border border-gray-700">
                        <p><strong className="text-white">Chrome:</strong> Tap lock icon <span className="text-gray-500">🔒</span> in URL bar &gt; Permissions &gt; Camera.</p>
                        <p><strong className="text-white">Safari:</strong> Settings &gt; Safari &gt; Camera &gt; Allow.</p>
                    </div>
                 </>
             )}

             {errorType === 'no-device' && (
                 <>
                    <h2 className="text-2xl font-black mb-3">No Camera Found</h2>
                    <p className="text-gray-400 mb-8 max-w-xs leading-relaxed">
                        It looks like this device doesn't have a camera or it is disabled.
                    </p>
                 </>
             )}

             {errorType === 'in-use' && (
                 <>
                    <h2 className="text-2xl font-black mb-3">Camera In Use</h2>
                    <p className="text-gray-400 mb-8 max-w-xs leading-relaxed">
                        Another app is using the camera. Please close other apps and try again.
                    </p>
                 </>
             )}
             
             {errorType === 'unknown' && (
                 <>
                    <h2 className="text-2xl font-black mb-3">Camera Error</h2>
                    <p className="text-gray-400 mb-8 max-w-xs leading-relaxed">
                        Something went wrong starting the camera. Please refresh and try again.
                    </p>
                 </>
             )}

             <button onClick={onClose} className="px-8 py-4 bg-white text-black rounded-xl font-bold hover:scale-105 transition-transform w-full max-w-xs">
                 Close Camera
             </button>
         </div>
     );
  }

  return (
    <div className="fixed inset-0 z-[200] bg-black text-white flex flex-col h-screen w-screen">
       
       {/* Top Bar */}
       <div className="absolute top-0 inset-x-0 p-4 z-20 flex justify-between items-center bg-gradient-to-b from-black/60 to-transparent pointer-events-none">
          <button onClick={onClose} className="p-3 rounded-full bg-black/40 backdrop-blur-md border border-white/10 pointer-events-auto active:scale-90 transition-transform">
             <X size={24} />
          </button>
          
          {sessionCount > 0 && !capturedImage && (
             <div className="bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-full border border-white/10 text-xs font-bold text-gray-300 flex items-center gap-1.5">
                <Layers size={12} className="text-green-400"/> {sessionCount} Captured
             </div>
          )}

          {!capturedImage && (
              <div className="flex gap-4 pointer-events-auto">
                 <button 
                    onClick={() => setShowGrid(!showGrid)} 
                    className={`p-3 rounded-full backdrop-blur-md border transition-all ${showGrid ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/50' : 'bg-black/40 text-white border-white/10'}`}
                 >
                    <Grid3x3 size={24} />
                 </button>
                 {isFlashSupported && (
                    <button 
                        onClick={toggleFlash} 
                        className={`p-3 rounded-full backdrop-blur-md border transition-all ${flashOn ? 'bg-yellow-400/20 text-yellow-400 border-yellow-400/50' : 'bg-black/40 text-white border-white/10'}`}
                    >
                        {flashOn ? <Zap size={24} fill="currentColor" /> : <ZapOff size={24} />}
                    </button>
                 )}
              </div>
          )}
       </div>

       {/* Main Viewport */}
       <div className="flex-1 relative overflow-hidden bg-gray-900">
           {/* Video always mounted but hidden when reviewing to allow instant retakes */}
            <div className={`absolute inset-0 w-full h-full ${capturedImage ? 'invisible' : 'visible'}`}>
                <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                muted
                className="w-full h-full object-cover"
                />
                {/* Grid Overlay */}
                {showGrid && (
                    <div className="absolute inset-0 pointer-events-none opacity-40">
                        <div className="absolute left-1/3 inset-y-0 w-px bg-white shadow-sm"></div>
                        <div className="absolute right-1/3 inset-y-0 w-px bg-white shadow-sm"></div>
                        <div className="absolute top-1/3 inset-x-0 h-px bg-white shadow-sm"></div>
                        <div className="absolute bottom-1/3 inset-x-0 h-px bg-white shadow-sm"></div>
                    </div>
                )}
            </div>
            
            {/* Captured Image Overlay */}
            {capturedImage && (
                <div className="absolute inset-0 z-10 bg-black flex items-center justify-center">
                    <img src={capturedImage} alt="Captured" className="max-w-full max-h-full object-contain" />
                </div>
            )}
           
           <canvas ref={canvasRef} className="hidden" />

            {/* Saved Toast */}
            <AnimatePresence>
                {showSavedToast && (
                    <motion.div 
                        initial={{ opacity: 0, y: 20, scale: 0.8 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0 }}
                        className="absolute bottom-10 left-1/2 -translate-x-1/2 bg-green-500/90 backdrop-blur-md text-white px-6 py-3 rounded-2xl font-black shadow-2xl flex items-center gap-2 z-50 pointer-events-none border border-green-400/50"
                    >
                        <div className="bg-white rounded-full p-0.5"><Check size={14} className="text-green-600" strokeWidth={4} /></div>
                        Saved!
                    </motion.div>
                )}
            </AnimatePresence>
       </div>

       {/* Bottom Controls */}
       <div className="p-6 pb-10 bg-black flex flex-col justify-center min-h-[160px]">
           {capturedImage ? (
               <div className="grid grid-cols-3 gap-4 items-center">
                   <button onClick={retake} className="flex flex-col items-center gap-2 text-gray-400 hover:text-white transition-colors group">
                       <div className="p-4 rounded-full bg-gray-800 group-active:scale-95 transition-transform"><RefreshCw size={24} /></div>
                       <span className="text-[10px] font-bold uppercase tracking-wider">Retake</span>
                   </button>
                   
                   <button onClick={handleSaveAndNext} className="flex flex-col items-center gap-2 text-blue-400 hover:text-blue-300 transition-colors group">
                       <div className="p-5 rounded-full bg-blue-900/30 border border-blue-500/50 group-active:scale-95 transition-transform"><Layers size={28} /></div>
                       <span className="text-[10px] font-bold uppercase tracking-wider text-center">Save &<br/>Next</span>
                   </button>
                   
                   <button onClick={handleSaveAndClose} className="flex flex-col items-center gap-2 text-green-400 hover:text-green-300 transition-colors group">
                       <div className="p-5 rounded-full bg-white text-black shadow-lg shadow-white/20 group-active:scale-95 transition-transform"><Check size={28} strokeWidth={4} /></div>
                       <span className="text-[10px] font-bold uppercase tracking-wider">Done</span>
                   </button>
               </div>
           ) : (
               <div className="flex justify-center items-center">
                   <button 
                      onClick={handleCapture} 
                      className="w-20 h-20 rounded-full border-[6px] border-white/30 flex items-center justify-center relative group active:scale-95 transition-transform"
                   >
                       <div className="w-16 h-16 bg-white rounded-full shadow-lg transition-all group-hover:scale-95" />
                   </button>
               </div>
           )}
       </div>
    </div>
  );
};

export default CameraCapture;
