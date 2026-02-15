import React, { useState, useCallback } from 'react';
import { Upload, HardDrive, Monitor, Zap, Play, FileVideo, Calendar, Clock, Box, ShieldCheck, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import MediaInfoFactory from 'mediainfo.js';

interface VideoMetadata {
  name: string;
  updatedDate: string;
  size: string;
  resolution: string;
  resolutionLabel: string;
  bitRate: string;
  bitRateMode: string;
  frameRate: string;
  duration: string;
  container: string;
  videoCodec: string;
  audioCodec: string;
}

const formatBytes = (bytes: number, decimals = 2) => {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const formatDuration = (value: any, durationStr3?: string) => {
  // Duration_String3 は "00:02:15.500" のような形式なので、これが使えれば最も正確
  if (durationStr3 && durationStr3.includes(':')) {
    const parts = durationStr3.split('.');
    return parts[0]; // "00:02:15" 
  }

  if (!value) return '不明';
  let num = parseFloat(value);
  if (isNaN(num) || num <= 0) return '不明';

  // 基本は ms と想定。
  let totalSeconds = Math.floor(num / 1000);

  // ヒューリスティック: 1000以上の値ならミリ秒。
  // それ以下で num が 0 より大きい場合、秒単位の可能性がある（例: 120s -> 2:00）。
  if (totalSeconds === 0 && num > 0) {
    totalSeconds = Math.floor(num);
  }

  const seconds = totalSeconds % 60;
  const minutes = Math.floor((totalSeconds / 60) % 60);
  const hours = Math.floor(totalSeconds / 3600);

  const h = hours > 0 ? `${hours}:` : '';
  const m = hours > 0 ? (minutes < 10 ? `0${minutes}:` : `${minutes}:`) : `${minutes}:`;
  const s = seconds < 10 ? `0${seconds}` : `${seconds}`;

  return `${h}${m}${s}`;
};

const getResolutionLabel = (width: number, height: number) => {
  const max = Math.max(width, height);
  if (max >= 3840) return '4K';
  if (max >= 2560) return '2K';
  if (max >= 1920) return 'FullHD';
  if (max >= 1280) return 'HD';
  return 'SD';
};

const getDetailedCodec = (track: any) => {
  if (!track) return '不明';
  const format = track['Format'] || '';
  const info = track['Format_Information'] || '';
  const profile = track['Format_Profile'] || '';

  // ISO/IEC名（ITU-T名）の形式を生成
  let isoName = info || format;
  let ituName = format;

  if (format === 'AVC') {
    isoName = 'Advanced Video Coding';
    ituName = 'H.264';
  } else if (format === 'HEVC') {
    isoName = 'High Efficiency Video Coding';
    ituName = 'H.265';
  } else if (format === 'MPEG-4 Visual') {
    isoName = 'MPEG-4 Part 2';
    ituName = 'Visual';
  }

  if (format === 'AAC') {
    isoName = 'Advanced Audio Coding';
    ituName = 'MPEG-4 AAC';
  }

  let result = isoName;
  if (ituName && ituName !== isoName) {
    result = `${isoName}（${ituName}）`;
  }

  if (profile && profile !== 'Base' && profile !== 'Main' && !result.includes(profile)) {
    result += ` [${profile}]`;
  }

  return result || track.CodecID || '不明';
};

function App() {
  const [isDragging, setIsDragging] = useState(false);
  const [metadata, setMetadata] = useState<VideoMetadata | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const analyzeVideo = useCallback(async (file: File) => {
    setIsAnalyzing(true);
    setError(null);
    setMetadata(null);

    try {
      const mediainfo = await MediaInfoFactory({
        locateFile: () => 'https://unpkg.com/mediainfo.js/dist/MediaInfoModule.wasm'
      });
      const getSize = () => file.size;
      const readChunk = async (chunkSize: number, offset: number) => {
        const chunk = file.slice(offset, offset + chunkSize);
        return new Uint8Array(await chunk.arrayBuffer());
      };

      const result = await mediainfo.analyzeData(getSize, readChunk);
      console.log('--- MediaInfo JSON Result ---');
      console.log(JSON.stringify(result, null, 2));

      const general = result.media?.track.find((t: any) => t['@type'] === 'General');
      const video = result.media?.track.find((t: any) => t['@type'] === 'Video');
      const audio = result.media?.track.find((t: any) => t['@type'] === 'Audio');

      if (video || general) {
        const width = video ? parseInt(video.Width) : 0;
        const height = video ? parseInt(video.Height) : 0;

        // 再生時間の取得を徹底強化
        // Duration_String3 は "HH:MM:SS.mmm" 形式なので、あれば最優先
        const ds3 = general?.Duration_String3 || video?.Duration_String3 || audio?.Duration_String3;

        const durations = result.media?.track
          .map((t: any) => parseFloat(t.Duration))
          .filter((d: number) => !isNaN(d) && d > 0);

        const rawDuration = general?.Duration || video?.Duration || audio?.Duration || (durations.length > 0 ? Math.max(...durations) : 0);

        setMetadata({
          name: file.name,
          updatedDate: new Date(file.lastModified).toLocaleString('ja-JP'),
          size: formatBytes(file.size),
          resolution: width && height ? `${width} x ${height}` : '不明',
          resolutionLabel: width && height ? getResolutionLabel(width, height) : '不明',
          bitRate: video?.BitRate ? `${(parseInt(video.BitRate) / 1000000).toFixed(2)} Mbps` : (general?.OverallBitRate ? `${(parseInt(general.OverallBitRate) / 1000000).toFixed(2)} Mbps` : '不明'),
          bitRateMode: video?.BitRate_Mode || general?.OverallBitRate_Mode || '不明',
          frameRate: video ? `${video.FrameRate ?? video.FrameRate_Nominal ?? '不明'} fps` : '不明',
          duration: formatDuration(rawDuration, ds3),
          container: general?.Format || '不明',
          videoCodec: getDetailedCodec(video),
          audioCodec: getDetailedCodec(audio),
        });
      } else {
        console.error('No valid track found:', result);
        setError('動画情報の解析に失敗しました。対応していないファイル形式の可能性があります。');
      }
    } catch (err) {
      console.error('Detailed Error:', err);
      setError(`解析中にエラーが発生しました: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsAnalyzing(false);
    }
  }, []);

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => {
    setIsDragging(false);
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) analyzeVideo(file);
  };

  const metadataItems = metadata ? [
    { label: 'ファイル名', value: metadata.name, icon: FileVideo, color: '#3b82f6' },
    { label: '更新日時', value: metadata.updatedDate, icon: Calendar, color: '#64748b' },
    { label: '再生時間', value: metadata.duration, icon: Clock, color: '#06b6d4' },
    { label: '容量', value: metadata.size, icon: HardDrive, color: '#10b981' },
    { label: '解像度', value: metadata.resolution, icon: Monitor, color: '#f59e0b', badge: metadata.resolutionLabel, badgeColor: 'badge-blue' },
    { label: 'ビットレート', value: metadata.bitRate, icon: Zap, color: '#f43f5e', badge: metadata.bitRateMode !== '不明' ? metadata.bitRateMode : undefined, badgeColor: 'badge-purple' },
    { label: 'フレームレート', value: metadata.frameRate, icon: Play, color: '#8b5cf6' },
    { label: 'コンテナ', value: metadata.container, icon: Box, color: '#ec4899' },
    { label: '動画コーデック', value: metadata.videoCodec, icon: ShieldCheck, color: '#f97316' },
    { label: '音声コーデック', value: metadata.audioCodec, icon: Volume2, color: '#a855f7' },
  ] : [];

  return (
    <div className="container">
      <header>
        <motion.h1
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="gradient-text"
          style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}
        >
          Check Meta
        </motion.h1>
        <p style={{ color: '#94a3b8', marginBottom: '3rem' }}>
          動画の詳細スペックを瞬時に確認
        </p>
      </header>

      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 0.2 }}
        className={`glass-card drop-zone ${isDragging ? 'active' : ''} ${isAnalyzing ? 'analyzing' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => document.getElementById('fileInput')?.click()}
      >
        <input
          id="fileInput"
          type="file"
          accept="video/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) analyzeVideo(file);
          }}
          style={{ display: 'none' }}
        />

        <div className="icon-wrapper" style={{ width: '60px', height: '60px', background: 'rgba(59, 130, 246, 0.1)' }}>
          {isAnalyzing ? (
            <Zap size={30} style={{ color: '#3b82f6' }} />
          ) : (
            <Upload size={30} style={{ color: '#94a3b8' }} />
          )}
        </div>

        <div>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
            {isAnalyzing ? '解析中...' : '動画をドロップ'}
          </h2>
          <p style={{ color: '#64748b', fontSize: '0.875rem' }}>
            またはクリックして選択
          </p>
        </div>
      </motion.div>

      {error && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{ color: '#ef4444', marginTop: '1rem', fontSize: '0.875rem' }}
        >
          {error}
        </motion.p>
      )}

      <AnimatePresence>
        {metadata && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="info-list"
          >
            {metadataItems.map((item, index) => (
              <div key={index} className="glass-card info-row">
                <div className="info-left">
                  <div className="icon-wrapper"><item.icon size={18} style={{ color: item.color }} /></div>
                  <div className="info-content">
                    <div className="info-label">{item.label}</div>
                    <div className="info-value" style={item.label === 'ファイル名' ? { wordBreak: 'break-all' } : {}}>
                      {item.value}
                      {item.badge && (
                        <span className={`badge ${item.badgeColor}`}>{item.badge}</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>

      <footer style={{ marginTop: '3rem', color: '#475569', fontSize: '0.75rem' }}>
        Powered by Mediainfo.js
      </footer>
    </div>
  );
}

export default App;
