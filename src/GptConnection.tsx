import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { db, downloadJson } from './api';
import openapi from './gpt-openapi.json';
export default function GptConnection({
  workspace,
  disabled,
}: {
  workspace: string;
  disabled: boolean;
}) {
  const [token, setToken] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const client = useQueryClient();
  const status = useQuery({
    queryKey: ['gpt-connection', workspace],
    enabled: !disabled && !!workspace,
    retry: false,
    queryFn: async () => {
      const { data, error } = await db().rpc('gpt_connection_status', { w: workspace });
      if (error) throw error;
      return data as { active: boolean; expires_at: string; last_used_at: string | null } | null;
    },
  });
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
    } catch {
      setError(
        'Не удалось выполнить действие. Сначала установите миграцию 004 по инструкции подключения, затем повторите.',
      );
    } finally {
      setBusy(false);
    }
  };
  const schema = () => ({
    ...openapi,
    servers: [{ url: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/atlas-gpt` }],
  });
  return (
    <section className="gpt-connection">
      <h3>Связь с ChatGPT Plus</h3>
      <p>
        Специальный GPT распознаёт ваши скриншоты, готовит описание и сохраняет места. Он также
        может читать и обновлять ваш атлас. Отдельная оплата OpenAI API не нужна; действуют лимиты
        Plus и бесплатного Supabase.
      </p>
      <a
        className="external-link"
        href="https://github.com/ninaseewa-art/travel-atlas/blob/main/docs/CHATGPT_SETUP.md"
        target="_blank"
        rel="noreferrer"
      >
        Пошаговое подключение
      </a>
      {status.error && (
        <p className="muted">Подключение ещё не настроено. Выполните шаг с SQL из инструкции.</p>
      )}
      {status.data?.active && (
        <p className="success">
          Ключ активен до {new Date(status.data.expires_at).toLocaleDateString('ru-RU')}.{' '}
          {status.data.last_used_at
            ? `Последнее обращение: ${new Date(status.data.last_used_at).toLocaleString('ru-RU')}.`
            : 'Обращений пока нет.'}
        </p>
      )}
      <button
        className="secondary full"
        disabled={disabled || busy}
        onClick={() =>
          void run(async () => {
            if (
              status.data?.active &&
              !confirm('Создать новый ключ? Прежний ключ ChatGPT сразу перестанет работать.')
            )
              return;
            const { data, error } = await db().rpc('create_gpt_connection', { w: workspace });
            if (error) throw error;
            setToken(data as string);
            await client.invalidateQueries({ queryKey: ['gpt-connection', workspace] });
          })
        }
      >
        {status.data?.active ? 'Заменить ключ подключения' : 'Создать ключ подключения'}
      </button>
      {token && (
        <div className="gpt-secret">
          <label>
            Ключ для поля API Key в настройках Actions
            <input type="password" value={token} readOnly autoComplete="off" />
          </label>
          <button
            className="secondary"
            onClick={() =>
              void run(async () => {
                await navigator.clipboard.writeText(token);
                setNotice(
                  'Ключ скопирован. Вставьте в Authentication → API Key → Bearer, не в переписку.',
                );
              })
            }
          >
            Скопировать ключ
          </button>
          <button className="text-button" onClick={() => setToken('')}>
            Скрыть и забыть
          </button>
          <p className="muted">
            Ключ показан только сейчас. Он даёт доступ к вашему атласу; вставьте его только в
            настройки Actions. Не отправляйте в чат и не публикуйте GPT.
          </p>
        </div>
      )}
      <div className="gpt-tools">
        <button
          className="secondary"
          disabled={disabled}
          onClick={() => downloadJson(schema(), 'atlas-gpt-openapi.json')}
        >
          Скачать схему Actions
        </button>
        <a className="external-link" href="/gpt-instructions.txt" target="_blank" rel="noreferrer">
          Инструкция для GPT
        </a>
      </div>
      {status.data?.active && (
        <button
          className="danger-button"
          disabled={busy || disabled}
          onClick={() =>
            void run(async () => {
              const { error } = await db().rpc('revoke_gpt_connection', { w: workspace });
              if (error) throw error;
              setToken('');
              await client.invalidateQueries({ queryKey: ['gpt-connection', workspace] });
              setNotice('Доступ GPT отключён. Сохранённые места остались в атласе.');
            })
          }
        >
          Отключить доступ GPT
        </button>
      )}
      <p className="muted">
        Подключение открывает этому GPT чтение и изменение записей вашего пространства. Скриншоты
        обрабатывает ChatGPT по вашим настройкам аккаунта; приложение не передаёт их само. Через
        Actions сохраняются текстовые карточки, без исходных изображений. Обычная история чатов не
        синхронизируется.
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="success" role="status">
          {notice}
        </p>
      )}
    </section>
  );
}
