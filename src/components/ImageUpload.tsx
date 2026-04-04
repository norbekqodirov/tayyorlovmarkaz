import React, { useRef, useState } from 'react';
import { Upload, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import api from '../api/client';

interface ImageUploadProps {
    value: string;
    onChange: (url: string) => void;
    label?: string;
    className?: string;
}

export default function ImageUpload({ value, onChange, label = 'Rasm', className = '' }: ImageUploadProps) {
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [dragOver, setDragOver] = useState(false);

    const handleUpload = async (file: File) => {
        if (!file.type.startsWith('image/')) {
            alert('Faqat rasm fayllari ruxsat etilgan!');
            return;
        }
        if (file.size > 10 * 1024 * 1024) {
            alert('Fayl hajmi 10MB dan oshmasligi kerak!');
            return;
        }
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append('file', file);
            const res = await api.post('/upload', formData, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            onChange(res.data.url);
        } catch (err) {
            console.error('Upload error:', err);
            alert('Rasm yuklashda xatolik yuz berdi!');
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) handleUpload(file);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleUpload(file);
    };

    const handleRemove = () => {
        onChange('');
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    return (
        <div className={className}>
            {label && <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1.5">{label}</label>}

            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleFileChange} />

            {value ? (
                <div className="relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800">
                    <img
                        src={value.startsWith('/') ? value : value}
                        alt="Preview"
                        className="w-full h-32 object-cover"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                        <button
                            onClick={() => fileInputRef.current?.click()}
                            className="p-2 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-white/30 transition-all"
                            type="button"
                        >
                            <Upload size={16} />
                        </button>
                        <button
                            onClick={handleRemove}
                            className="p-2 bg-white/20 backdrop-blur-sm rounded-lg text-white hover:bg-rose-500/50 transition-all"
                            type="button"
                        >
                            <X size={16} />
                        </button>
                    </div>
                </div>
            ) : (
                <div
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={handleDrop}
                    className={`flex flex-col items-center justify-center gap-2 py-6 px-4 rounded-xl border-2 border-dashed cursor-pointer transition-all ${dragOver
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-zinc-200 dark:border-zinc-700 hover:border-blue-400 bg-zinc-50 dark:bg-zinc-800'
                        }`}
                >
                    {uploading ? (
                        <>
                            <Loader2 size={24} className="text-blue-500 animate-spin" />
                            <span className="text-xs font-bold text-zinc-500">Yuklanmoqda...</span>
                        </>
                    ) : (
                        <>
                            <ImageIcon size={24} className="text-zinc-400" />
                            <span className="text-xs font-bold text-zinc-500">Rasmni yuklang yoki shu yerga tashlang</span>
                            <span className="text-[10px] text-zinc-400">JPG, PNG, WebP — max 10MB</span>
                        </>
                    )}
                </div>
            )}
        </div>
    );
}
