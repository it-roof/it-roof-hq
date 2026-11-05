export type KundenContact = {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
};

export type KundenCompany = {
  id: string;
  name: string;
  city: string | null;
  contacts: KundenContact[];
};
