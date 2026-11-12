import { test, expect } from '@playwright/test';

test('parcours étudiant : leçon, quiz, TP et outils', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/connexion?mode=register');
  await page.getByPlaceholder('Ex. Awa N.').fill('Étudiant Test');
  await page.getByPlaceholder('toi@exemple.fr').fill(`e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@example.org`);
  await page.getByPlaceholder('10 caractères minimum').fill('UnMotDePasseSolide123!');
  await page.getByRole('button', { name: 'Créer mon espace étudiant' }).click();
  await expect(page).toHaveURL(/\/espace/);

  await page.goto('/cours/modele-osi');
  await page.getByRole('button', { name: 'J’ai terminé' }).click();
  await expect(page.locator('.lesson-heading')).toContainText('LEÇON 2');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Marquer à revoir' })).toBeVisible();

  const quiz = await (await page.request.get('/api/quizzes/quiz-osi')).json();
  await page.goto('/quiz/quiz-osi');
  for (let i = 0; i < quiz.questions.length; i++) {
    const q = quiz.questions[i];
    await expect(page.locator('.question-panel h2')).toHaveText(q.prompt);
    if (q.type === 'order') {
      await expect(page.locator('.order-answers strong').first()).not.toBeEmpty();
      await page.locator('.order-answers button:not([disabled])').first().click();
    } else if (q.type === 'match') {
      const selects = page.locator('.match-answers select');
      for (let n = 0; n < await selects.count(); n++) await selects.nth(n).selectOption(String(n));
    } else if (q.type === 'numeric') {
      await page.getByPlaceholder('Saisis un nombre').fill('443');
    } else if (q.type === 'multiple') {
      await page.locator('.question-panel input[type=checkbox]').first().check();
    } else {
      await page.locator('.question-panel input[type=radio]').first().check();
    }
    if (i < quiz.questions.length - 1) await page.getByRole('button', { name: 'Suivante' }).click();
  }
  await page.getByRole('button', { name: 'Terminer le quiz' }).click();
  await expect(page.getByText('Résultat enregistré dans ton espace étudiant.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Correction détaillée' })).toBeVisible();
  await expect(page.locator('.question-review')).toHaveCount(quiz.questions.length);
  await expect(page.locator('.question-review').first()).toContainText('Raisonnement :');
  await expect(page.locator('.question-review').first()).toContainText('Erreur à éviter :');

  await page.goto('/laboratoires/lab-premier-lan');
  const checks = page.locator('input[type=checkbox]');
  await expect(checks).toHaveCount(5);
  for (let i = 0; i < 5; i++) {
    const saved = page.waitForResponse(response => response.url().includes('/checklist') && response.request().method() === 'PUT');
    await checks.nth(i).check();
    await saved;
  }
  await page.locator('input[name=lab-answer]').first().check();
  await page.getByRole('button', { name: 'Valider mon travail' }).click();
  await expect(page.getByText(/TP validé|laboratoire validé|félicitations/i).first()).toBeVisible();
  await page.goto('/espace');
  await expect(page.locator('body')).toContainText('Étudiant');

  await page.goto('/assistant');
  await page.getByRole('button', { name: 'Calcule 192.168.1.70/26' }).click();
  await expect(page.locator('.chat-messages')).toContainText('192.168.1.64/26');
  await page.goto('/outils?outil=ip');
  await expect(page.locator('.primary-result')).toContainText('192.168.1.64/26');
  await page.getByRole('tab', { name: 'Mode exercice' }).click();
  for (const [label, value] of [['Adresse réseau','192.168.1.64'], ['Adresse de broadcast','192.168.1.127'], ['Premier hôte','192.168.1.65'], ['Dernier hôte','192.168.1.126'], ['Hôtes utilisables','62']]) await page.getByLabel(label, { exact:true }).fill(value);
  await page.getByRole('button', { name: 'Vérifier mes réponses' }).click();
  await expect(page.getByText('Tout est correct !', { exact:false })).toBeVisible();
  await page.getByRole('button', { name: 'Activer le mode clair' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect.poll(async () => (await (await page.request.get('/api/auth/me')).json()).user).toBeNull();
  expect(errors).toEqual([]);
});

test('mise en page mobile et accès libre aux cours avancés', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/cours/signaux-telecoms');
  await expect(page.locator('h1').first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
});
