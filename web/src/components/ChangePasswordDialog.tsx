import { useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { auth } from '@/lib/authStores';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ChangePasswordDialog({ open, onOpenChange }: Props) {
  const [oldPassword, setOld] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setOld('');
      setPassword('');
      setRepeat('');
      setError('');
      setBusy(false);
    }
  }, [open]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== repeat) {
      setError('Пароли не совпадают');
      return;
    }
    setBusy(true);
    try {
      await auth.changePassword(oldPassword, password);
      toast.success('Пароль изменён');
      onOpenChange(false);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Сменить пароль</DialogTitle>
        </DialogHeader>
        <form className="space-y-3" onSubmit={submit}>
          <label className="grid gap-1 text-sm"><span>Текущий пароль</span><Input autoFocus type="password" aria-label="Текущий пароль" autoComplete="current-password" value={oldPassword} onChange={(e) => setOld(e.target.value)} /></label>
          <label className="grid gap-1 text-sm"><span>Новый пароль (от 8 символов)</span><Input type="password" aria-label="Новый пароль (от 8 символов)" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></label>
          <label className="grid gap-1 text-sm"><span>Повторите новый пароль</span><Input type="password" aria-label="Повторите новый пароль" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} /></label>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="submit" disabled={busy || !oldPassword || !password}>
              Сохранить
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
