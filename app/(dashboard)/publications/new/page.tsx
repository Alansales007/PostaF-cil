import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { db } from '@/lib/db';
import { NewPublicationFlow } from '@/components/upload/new-publication-flow';
import type { SocialProviderId } from '@/types';

export default async function NewPublicationPage() {
  const session = await getServerSession(authOptions);

  const accounts = session?.user?.id
    ? await db.socialAccount.findMany({ where: { userId: session.user.id, status: 'ACTIVE' } })
    : [];
  const connectedProviders = accounts.map((a) => a.provider as SocialProviderId);

  return <NewPublicationFlow connectedProviders={connectedProviders} />;
}
