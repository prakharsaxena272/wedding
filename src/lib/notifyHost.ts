import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { HOST_NOTIFICATION_EMAIL, HostNotificationType } from '../types/wedding';

export async function dispatchHostNotification(params: {
  type: HostNotificationType;
  actorName: string;
  summary: string;
}): Promise<void> {
  const cleanActor = params.actorName.trim().slice(0, 120) || 'Wedding Guest';
  const cleanSummary = params.summary.trim().slice(0, 500) || 'New wedding update';

  const notifRef = doc(collection(db, 'hostNotifications'));
  const firestoreWrite = setDoc(notifRef, {
    type: params.type,
    actorName: cleanActor,
    summary: cleanSummary,
    recipientEmail: HOST_NOTIFICATION_EMAIL,
    read: false,
    createdAt: serverTimestamp(),
  }).catch((err) => {
    console.warn('Could not save host notification record:', err);
  });

  const serverDispatch = fetch('/api/notify-host', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: params.type,
      actorName: cleanActor,
      summary: cleanSummary,
    }),
  }).catch((err) => {
    console.warn('Could not trigger server host notification:', err);
  });

  await Promise.all([firestoreWrite, serverDispatch]);
}
