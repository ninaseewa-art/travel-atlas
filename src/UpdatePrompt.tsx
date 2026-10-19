import { useRegisterSW } from 'virtual:pwa-register/react';
export default function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();
  if (!needRefresh) return null;
  return (
    <aside className="update-prompt" role="status">
      Доступна новая версия атласа.
      <div>
        <button
          className="primary"
          onClick={() => {
            if (
              confirm(
                'Обновить приложение? Сначала сохраните открытые черновики: страница будет перезагружена.',
              )
            )
              void updateServiceWorker(true);
          }}
        >
          Обновить приложение
        </button>
        <button className="text-button" onClick={() => setNeedRefresh(false)}>
          Позже
        </button>
      </div>
    </aside>
  );
}
