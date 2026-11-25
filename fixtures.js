// Original, synthetic contrasts. Pair metadata is exported, but hidden during play.
// Variant order is balanced across rounds; neither round is a preferred style.
const pairs = [
  {
    hypothesis: 'concrete versus abstract', topic: 'code review',
    claim: 'A large pull request makes it harder to identify the change responsible for a regression.',
    a: 'When a pull request changes too much at once, tracing a regression back to one change gets harder.',
    b: 'When a pull request changes too much at once, identifying the source of a regression gets harder.'
  },
  {
    hypothesis: 'concrete versus abstract', topic: 'testing',
    claim: 'A test that depends on the current date can fail when the date changes.',
    a: 'A test that reads the current date can pass today and fail tomorrow without a code change.',
    b: 'A test that reads the current date can change its result over time without a code change.'
  },
  {
    hypothesis: 'detail timing', topic: 'database migrations',
    claim: 'An index added before a migration can reduce the time needed to find rows to update.',
    a: 'Adding an index before the migration can reduce the time spent finding rows to update.',
    b: 'Before the migration, adding an index can reduce the time spent finding rows to update.'
  },
  {
    hypothesis: 'detail timing', topic: 'timeouts',
    claim: 'A thirty-second timeout can leave a user waiting after the work has already failed.',
    a: 'A thirty-second timeout can leave someone waiting after the work has already failed.',
    b: 'After the work has already failed, a thirty-second timeout can leave someone waiting.'
  },
  {
    hypothesis: 'amount of setup', topic: 'deployment',
    claim: 'Deploying behind a feature flag lets a team release code before making it available to users.',
    a: 'Deploying behind a feature flag lets a team release code before making it available to users.',
    b: 'To separate deployment from availability, a team can release code behind a feature flag before making it available to users.'
  },
  {
    hypothesis: 'amount of setup', topic: 'monitoring',
    claim: 'A dashboard grouped by endpoint can reveal a slow endpoint hidden by an overall average.',
    a: 'A dashboard grouped by endpoint can reveal a slow endpoint that the overall average hides.',
    b: 'To see where latency is concentrated, a dashboard grouped by endpoint can reveal a slow endpoint that the overall average hides.'
  },
  {
    hypothesis: 'explicit versus implicit bridge', topic: 'queues',
    context: 'The queue can keep growing while workers are busy.',
    claim: 'If the queue grows, a new job waits longer before a worker starts it.',
    a: 'As a result, a new job waits longer before a worker starts it.',
    b: 'A new job waits longer before a worker starts it.'
  },
  {
    hypothesis: 'explicit versus implicit bridge', topic: 'incident response',
    context: 'An alert can fire for several different failure modes.',
    claim: 'Responders then need more information before choosing a fix.',
    a: 'That means responders need more information before choosing a fix.',
    b: 'Responders need more information before choosing a fix.'
  },
  {
    hypothesis: 'literal versus performative wording', topic: 'observability',
    claim: 'A dashboard can show symptoms without identifying the cause.',
    a: 'A dashboard can show the symptoms without telling you what caused them.',
    b: 'A dashboard can show the symptoms, but it cannot tell the whole story of what caused them.'
  },
  {
    hypothesis: 'literal versus performative wording', topic: 'automation',
    claim: 'Automating a deployment does not remove the need to check its result.',
    a: 'Automating a deployment does not remove the need to check the result.',
    b: 'Automating a deployment does not let the team take its eyes off the result.'
  },
  {
    hypothesis: 'reader vocabulary', topic: 'database consistency',
    claim: 'A database read can return an older value after a write.',
    a: 'After a write, a database read can still return an older value.',
    b: 'After a write, a database read can still return a stale value.'
  },
  {
    hypothesis: 'reader vocabulary', topic: 'network requests',
    claim: 'A client can repeat a request when it does not receive a response.',
    a: 'A client can repeat a request when it does not receive a response.',
    b: 'A client can retry a request when it does not receive a response.'
  }
];

const FIXTURES = [0, 1].map(round => ({
  kind: 'writing-gym-deck',
  version: 1,
  id: `starter-v2-${round + 1}`,
  title: `Isolated demo · round ${round + 1}`,
  seed: `engineering-writing-v2-${round + 1}`,
  cards: pairs.map((pair, i) => {
    const variant = (i + round) % 2 === 0 ? 'a' : 'b';
    return {
      id: `engineering-${String(i + 1).padStart(2, '0')}-${variant}`,
      sentence: pair[variant],
      context: pair.context || '',
      pairId: `engineering-pair-${i + 1}`,
      hypothesis: pair.hypothesis,
      variant: variant.toUpperCase(),
      topic: pair.topic,
      claim: pair.claim
    };
  })
}));
