import { useEffect, useRef, useState } from 'react';
import { StudioInlineState } from '../studio/StudioPrimitives';

interface CompanyPdfPreviewProps {
  blob: Blob;
}

type PdfRenderTask = {
  promise: Promise<void>;
  cancel: () => void;
};

type PdfPageSlot = {
  pageNumber: number;
  frame: HTMLDivElement;
  generation: number;
  canvas?: HTMLCanvasElement;
  renderTask?: PdfRenderTask;
};

export function fitPdfPageScale(containerWidth: number, pageWidth: number) {
  if (!Number.isFinite(pageWidth) || pageWidth <= 0) return 1;
  const availableWidth = Math.max(320, containerWidth - 32);
  return Math.min(1.5, availableWidth / pageWidth);
}

export function CompanyPdfPreview({ blob }: CompanyPdfPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let cancelled = false;
    let loadingTask: { destroy: () => Promise<void> } | undefined;
    let observer: IntersectionObserver | undefined;
    const pageSlots = new Map<Element, PdfPageSlot>();
    container.replaceChildren();
    setStatus('loading');

    const releasePage = (slot: PdfPageSlot) => {
      slot.generation += 1;
      slot.renderTask?.cancel();
      slot.renderTask = undefined;
      if (slot.canvas) {
        slot.canvas.width = 0;
        slot.canvas.height = 0;
        slot.canvas.remove();
        slot.canvas = undefined;
      }
    };

    void (async () => {
      await import('pdfjs-dist/build/pdf.worker.mjs');
      const { getDocument } = await import('pdfjs-dist');

      const data = new Uint8Array(await blob.arrayBuffer());
      if (cancelled) return;

      const task = getDocument({ data });
      loadingTask = task;
      const pdf = await task.promise;
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      const firstPage = await pdf.getPage(1);
      const firstViewport = firstPage.getViewport({
        scale: fitPdfPageScale(container.clientWidth, firstPage.getViewport({ scale: 1 }).width),
      });
      firstPage.cleanup();

      const renderPage = async (slot: PdfPageSlot) => {
        if (cancelled || slot.canvas || slot.renderTask) return;
        const generation = slot.generation + 1;
        slot.generation = generation;
        let page: Awaited<ReturnType<typeof pdf.getPage>> | undefined;

        try {
          page = await pdf.getPage(slot.pageNumber);
          if (cancelled || slot.generation !== generation) return;

          const baseViewport = page.getViewport({ scale: 1 });
          const viewport = page.getViewport({ scale: fitPdfPageScale(container.clientWidth, baseViewport.width) });
          const canvas = document.createElement('canvas');
          canvas.className = 'company-pdf-preview__canvas';
          canvas.width = Math.ceil(viewport.width * pixelRatio);
          canvas.height = Math.ceil(viewport.height * pixelRatio);
          canvas.style.width = `${Math.ceil(viewport.width)}px`;
          canvas.style.height = `${Math.ceil(viewport.height)}px`;

          const context = canvas.getContext('2d', { alpha: false });
          if (!context) throw new Error('Canvas is unavailable');

          slot.frame.style.width = `${Math.ceil(viewport.width)}px`;
          slot.frame.style.height = `${Math.ceil(viewport.height)}px`;
          slot.frame.replaceChildren(canvas);
          slot.canvas = canvas;

          const renderTask = page.render({
            canvas,
            canvasContext: context,
            viewport,
            transform: pixelRatio === 1 ? undefined : [pixelRatio, 0, 0, pixelRatio, 0, 0],
          }) as PdfRenderTask;
          slot.renderTask = renderTask;
          await renderTask.promise;
        } catch (error) {
          if (!cancelled && slot.generation === generation && (error as { name?: string })?.name !== 'RenderingCancelledException') {
            setStatus('error');
          }
        } finally {
          page?.cleanup();
          if (slot.generation === generation) slot.renderTask = undefined;
        }
      };

      const scrollRoot = container.parentElement;
      observer = new IntersectionObserver((entries) => {
        for (const entry of entries) {
          const slot = pageSlots.get(entry.target);
          if (!slot) continue;
          if (entry.isIntersecting) void renderPage(slot);
          else releasePage(slot);
        }
      }, { root: scrollRoot, rootMargin: '800px 0px', threshold: 0.01 });

      for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
        if (cancelled) return;
        const pageElement = document.createElement('section');
        pageElement.className = 'company-pdf-preview__page';
        pageElement.setAttribute('aria-label', `Trang ${pageNumber} / ${pdf.numPages}`);

        const pageLabel = document.createElement('span');
        pageLabel.className = 'company-pdf-preview__page-label';
        pageLabel.textContent = `Trang ${pageNumber} / ${pdf.numPages}`;

        const frame = document.createElement('div');
        frame.className = 'company-pdf-preview__frame';
        frame.style.width = `${Math.ceil(firstViewport.width)}px`;
        frame.style.height = `${Math.ceil(firstViewport.height)}px`;

        pageElement.append(pageLabel, frame);
        container.append(pageElement);
        pageSlots.set(pageElement, { pageNumber, frame, generation: 0 });
        observer.observe(pageElement);
      }

      if (!cancelled) setStatus('ready');
    })().catch(() => {
      if (!cancelled) setStatus('error');
    });

    return () => {
      cancelled = true;
      observer?.disconnect();
      for (const slot of pageSlots.values()) releasePage(slot);
      void loadingTask?.destroy().catch(() => undefined);
      container.replaceChildren();
    };
  }, [blob]);

  return (
    <div className='company-pdf-preview'>
      {status === 'loading' ? <StudioInlineState tone='info'>Đang dựng bản xem trước PDF...</StudioInlineState> : null}
      {status === 'error' ? <StudioInlineState tone='danger'>Không thể dựng nội dung PDF này. Bạn vẫn có thể tải tệp xuống.</StudioInlineState> : null}
      <div
        ref={containerRef}
        className='company-pdf-preview__pages'
        aria-label='Nội dung tài liệu PDF'
        aria-busy={status === 'loading'}
        hidden={status === 'error'}
      />
    </div>
  );
}
