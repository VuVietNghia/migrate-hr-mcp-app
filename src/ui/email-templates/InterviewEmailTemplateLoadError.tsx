export interface InterviewEmailTemplateLoadErrorProps {
  message: string;
  onRetry(): void;
}

export function InterviewEmailTemplateLoadError({
  message,
  onRetry,
}: InterviewEmailTemplateLoadErrorProps) {
  return (
    <div className="interview-template-load-error">
      <p className="interview-template-inline-error" role="alert">{message}</p>
      <button type="button" className="email-action-btn" onClick={onRetry}>Thử tải lại</button>
    </div>
  );
}
