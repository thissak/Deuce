export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-notice" role="alert">
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn-plain" onClick={onRetry}>
          다시 시도
        </button>
      )}
    </div>
  )
}
