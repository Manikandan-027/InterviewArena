import type { BankQ } from "./bank";

type Item = [string, string[], number, string, number?]; // prompt, options, correct, explanation, difficulty

function passage(
  category: string,
  key: string,
  text: string,
  timeLimit: number,
  items: Item[],
): BankQ[] {
  return items.map(([prompt, options, correctIndex, explanation, difficulty]) => ({
    category,
    passageKey: key,
    passageText: text,
    prompt,
    options,
    correctIndex,
    explanation,
    timeLimit,
    difficulty: difficulty ?? 2,
  }));
}

export const READING: BankQ[] = [
  ...passage(
    "reading",
    "remote-work",
    "Most teams now work hybrid, but adoption is uneven. Companies that wrote clear policies about which roles can work remotely report higher retention than those that decided ad hoc. The advantage is not just flexibility: teams that meet in person a few days a week keep a shared sense of context, while fully remote teams often lose the informal conversations that surface problems early. The best-performing organisations treat remote work as a design problem — deciding deliberately which work belongs in the office, which belongs online, and which does not depend on location at all.",
    60,
    [
      [
        "What is the main argument of the passage?",
        [
          "Remote work should be banned",
          "Offices are always better than remote work",
          "Organisations should deliberately design where work happens",
          "Hybrid work lowers retention",
        ],
        2,
        "The final sentence frames remote work as a design problem — decide deliberately which work fits which setting.",
        2,
      ],
      [
        "According to the passage, teams that meet in person a few days a week:",
        [
          "retain higher paying staff",
          "keep a shared sense of context",
          "lose informal conversations",
          "work longer hours",
        ],
        1,
        "The passage credits in-person days with maintaining a shared sense of context.",
        1,
      ],
      [
        "The passage suggests informal conversations matter because they:",
        [
          "reduce the need for meetings",
          "help problems surface early",
          "replace formal policies",
          "increase salary offers",
        ],
        1,
        "Fully remote teams lose the chats that “surface problems early” — that is why they matter.",
        2,
      ],
    ],
  ),
  ...passage(
    "reading",
    "funding-rounds",
    "Startups usually raise a seed round to prove that a product works, and an A round to scale what has been proven. Seed investors bet on the team and the early signal; A-round investors look for repeatable growth and a credible path to healthy margins. A common failure is spending A-round money the way seed money was spent — buying logos instead of repeatable demand. The discipline that separates survivors is tracking one metric the investors can verify, and improving it every quarter.",
    60,
    [
      [
        "What do A-round investors primarily look for?",
        [
          "A famous founding team",
          "Repeatable growth and a path to margins",
          "A prototype",
          "A large user base at any cost",
        ],
        1,
        "The passage states A-round investors look for repeatable growth and a credible path to margins.",
        1,
      ],
      [
        "A seed round exists mainly to:",
        [
          "pay the investors back",
          "prove that a product works",
          "scale marketing spend",
          "hire senior executives",
        ],
        1,
        "Seed money is the proof-of-concept stage; scaling comes at A round.",
        1,
      ],
      [
        "Which is called a common failure in the passage?",
        [
          "Raising too early",
          "Skipping the seed round",
          "Buying logos instead of repeatable demand",
          "Ignoring investors' questions",
        ],
        2,
        "Spending growth-stage money like seed money — chasing logos rather than repeatable demand — is the failure described.",
        2,
      ],
    ],
  ),
  ...passage(
    "reading",
    "customer-retention",
    "Acquiring a new customer typically costs several times more than keeping an existing one, yet most product reviews measure launches, not churn. A customer who stays two extra years contributes not only their own fees but also referrals and lower support costs. Small improvements in onboarding — a first successful session in under an hour, for example — compound: they raise the chance that the second session happens, and the second session is the strongest predictor of long-term retention.",
    60,
    [
      [
        "What is the central claim of the passage?",
        [
          "Launches matter more than churn",
          "Keeping customers is cheaper and its benefits compound",
          "Onboarding should take at least an hour",
          "Referrals are the only metric that matters",
        ],
        1,
        "The whole passage argues retention is cheaper than acquisition and that small gains compound.",
        1,
      ],
      [
        "According to the passage, the strongest predictor of long-term retention is:",
        [
          "the first session",
          "the second session",
          "the customer's fee size",
          "the support ticket volume",
        ],
        1,
        "“The second session is the strongest predictor of long-term retention.”",
        1,
      ],
      [
        "Why does a first successful session in under an hour matter?",
        [
          "It lowers support costs immediately",
          "It raises the chance the second session happens",
          "It guarantees a referral",
          "It reduces acquisition cost",
        ],
        1,
        "It compounds by making the second session — the key predictor — more likely.",
        2,
      ],
    ],
  ),
  ...passage(
    "reading",
    "automation-jobs",
    "Automation removes the repetitive parts of a job, not the job itself. In warehouses, robots handle the moving, while people handle exceptions, planning and machine upkeep. In software companies, tools that draft documentation still need a human to decide what is worth documenting. The employees who thrive treat the machine as a colleague: they learn what it does best, and move their own effort to the parts that require judgement.",
    60,
    [
      [
        "What is the main claim of the passage?",
        [
          "Automation eliminates jobs",
          "Automation removes repetitive tasks, not roles",
          "Robots are better at planning than people",
          "Software documentation is fully automated",
        ],
        1,
        "The opening line states it directly: automation removes repetitive parts, not the job itself.",
        1,
      ],
      [
        "In warehouses, people handle:",
        [
          "all the moving",
          "exceptions, planning and machine upkeep",
          "robot maintenance only",
          "inventory purchasing",
        ],
        1,
        "The passage assigns exceptions, planning and upkeep to people.",
        1,
      ],
      [
        "Employees who thrive around automation:",
        [
          "avoid learning how the tools work",
          "compete with the machine at repetitive tasks",
          "shift effort to work requiring judgement",
          "request fewer machines",
        ],
        2,
        "They treat the machine as a colleague and move to the judgement-heavy parts of the job.",
        2,
      ],
    ],
  ),
];

export const LISTENING: BankQ[] = [
  ...passage(
    "listening",
    "interview-tips",
    "Before your interview, read the job description out loud once, and list three things you have done that match it. During the interview, answer with short stories: a situation, what you did, and the result. Do not memorise speeches — interviewers can hear them. End every answer by linking it back to the role. Finally, always close with a question of your own; asking nothing reads as disinterest.",
    70,
    [
      [
        "Before the interview, the speaker advises you to:",
        [
          "Memorise a prepared speech",
          "List three things you have done that match the job description",
          "Call the interviewer",
          "Skip reading the job description",
        ],
        1,
        "The opening advice: read the JD and list three matching accomplishments.",
        1,
      ],
      [
        "According to the audio, a good answer follows this shape:",
        [
          "Opinion, reason, apology",
          "Situation, what you did, result",
          "Timeline, budget, team size",
          "Question, pause, conclusion",
        ],
        1,
        "The speaker describes the situation → action → result story format.",
        1,
      ],
      [
        "What does the speaker say about memorised speeches?",
        [
          "They are the safest strategy",
          "Interviewers can tell when they are memorised",
          "They should be over five minutes",
          "They only work for senior roles",
        ],
        1,
        "“Do not memorise speeches — interviewers can hear them.”",
        1,
      ],
    ],
  ),
  ...passage(
    "listening",
    "product-launch",
    "The checkout redesign ships on Thursday at ten in the morning. It is a staged rollout: ten percent of traffic on day one, fifty percent on day two, and full rollout on day three, unless the error rate crosses one percent. The payments team will sit on call for all three days. Support will show a banner in the app explaining the new layout, and the old flow stays available for one week as a fallback.",
    70,
    [
      [
        "When does the checkout redesign ship?",
        [
          "Wednesday at 6 pm",
          "Thursday at 10 am",
          "Friday at 10 am",
          "Monday at 9 am",
        ],
        1,
        "It ships on Thursday at ten in the morning.",
        1,
      ],
      [
        "The rollout stops early if:",
        [
          "Traffic exceeds plan",
          "The error rate crosses one percent",
          "Support gets extra tickets",
          "Payments calls end",
        ],
        1,
        "Full rollout on day three happens only while the error rate stays under one percent.",
        2,
      ],
      [
        "How long does the old checkout flow remain available?",
        [
          "One day",
          "Three days",
          "One week",
          "One month",
        ],
        2,
        "The old flow stays available for one week as a fallback.",
        1,
      ],
    ],
  ),
  ...passage(
    "listening",
    "weekly-update",
    "Here is the weekly update. The churn dashboard is live, and the first numbers show churn down two points quarter on quarter. The hiring panel finished interviews on Friday; we made two offers and expect both to accept by next Monday. The vendor contract is blocked on legal review, and I have escalated it — I need an answer before Wednesday. That is all, and thank you.",
    70,
    [
      [
        "The first numbers on the churn dashboard show churn:",
        [
          "up two points",
          "down two points quarter on quarter",
          "unchanged",
          "down two points year on year",
        ],
        1,
        "Churn is down two points quarter on quarter.",
        1,
      ],
      [
        "How many offers did the hiring panel make?",
        ["One", "Two", "Three", "Four"],
        1,
        "They made two offers, both expected to accept by Monday.",
        1,
      ],
      [
        "What is currently blocked?",
        [
          "The churn dashboard",
          "The hiring process",
          "The vendor contract on legal review",
          "The weekly meeting",
        ],
        2,
        "The vendor contract is blocked on legal review and has been escalated.",
        1,
      ],
    ],
  ),
  ...passage(
    "listening",
    "onboarding",
    "Welcome to the team. Your first week follows a simple path. On day one, set up your laptop, accounts and access, and meet your buddy. By day three, you should have pushed your first change to the staging branch. By the end of week one, we review what you learned and pick one small ticket you will own completely. Do not wait to be assigned work — if you are stuck, ask your buddy first, and the team second.",
    70,
    [
      [
        "By which day should the new hire push their first change to staging?",
        ["Day one", "Day two", "Day three", "Day five"],
        2,
        "The day-three milestone is the first change to the staging branch.",
        1,
      ],
      [
        "By the end of week one, the new hire will:",
        [
          "lead a project",
          "review what they learned and own one small ticket",
          "give the weekly update",
          "exit the onboarding program",
        ],
        1,
        "Week one ends with a review plus one small ticket they own completely.",
        1,
      ],
      [
        "If the new hire is stuck, who should they ask first?",
        ["The team", "Their buddy", "The vendor", "Nobody — wait for work"],
        1,
        "Ask the buddy first, and the team second.",
        1,
      ],
    ],
  ),
];
