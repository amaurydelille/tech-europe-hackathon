# Tutor AI

> The most tailored tutor ever, powered by AI

An App where you discuss about things you want to learn, which then generates you a full working video class to watch.


## Backend: Python

### 1. Agent Gradium vocal

Gradium
"Comment tu aimes apprendre"
"Que sais-tu sur sujet X"


### 2. Course generation

#### 2.1 Raw Course

> Rapport de l’agent voice + persona

Agent prof
Search family + GLINER ?
Output: leçon


> output: Cours brut (two markdowns)

#### 2.2 Video generation

> Input: Two markdowns : the very detailed class, and a synthetized version (for the script that will appear below the video)

- Stack : Agent réalisateur based on the openai harness 

Ask it to work on a timestamped script of the sort
- 0:37 : "Le consul avait marché en Rome..."
- [0:37 - 0:42] : vidéo of legionaries marching, detailed prompt: "... "(detail the subject, lightining, setting, context, action, style, etc)
- [0:42 - 0:45] : image of the consul, detailed prompt: "Middle-aged consul, set..." (detail the subject, lightining, setting, context, style, etc)
- 0:42: "C'était une situation exceptionnelle"

Agent uses TTS Gradium to make the transcript for each
 - through a tool generate_tts(prompt) -> outputs the duration and the path under which it was put
Agent uses Seedance to make the videos
 - through a tool generate_video(prompt) -> outputs the duration and images sampled from the video every second of it (so that the model sees what was made)

> Output: exact timestamped script

Then a program just stitches togther all the videos and speeches sounds to make a full video


## Frontend : Next

  http://...

┌──────────────┐
│              │
│              │
│              │
│              │
│              │
│              │
│          ... │
│           ♡  │
└──────────────┘
        ∨

Lorem ipsum...
