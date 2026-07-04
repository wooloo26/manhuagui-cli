export interface Chapter {
  title: string;
  url: string;
  pageCount: number;
}

export interface Section {
  name: string;
  chapters: Chapter[];
}

export interface ComicInfo {
  title: string;
  id: string;
  sections: Section[];
}
