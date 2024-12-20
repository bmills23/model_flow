import tkinter as tk
from tkinter import ttk, messagebox

# Default parameters
DEFAULT_VADOSE_PARAMS = {
    "Hydraulic Gradient" : 0.1,
    "Effective Porosity": 0.25,
    "Fraction Organic Carbon": 0.009,
    "Hydraulic Conductivity": 0.1,
    "Soil Bulk Density" : 1.64,
    "Longitudinal Dispersion": 0.0,
    "Transverse Dispersion": 0.0,
    "Vertical Dispersion": 0.0,
}

DEFAULT_SATURATED_PARAMS = {
    "Hydraulic Gradient" : 0.1,
    "Effective Porosity": 0.25,
    "Fraction Organic Carbon": 0.009,
    "Hydraulic Conductivity": 0.1,
    "Soil Bulk Density" : 1.64,
    "Longitudinal Dispersion": 0.0,
    "Transverse Dispersion": 0.0,
    "Vertical Dispersion": 0.0,
}

DEFAULT_DISSOLVED_PARAMS = {
    "Hydraulic Gradient (m/m)" : 0.1,
    "Effective Porosity (cm³/cm³)": 0.25,
    "Fraction Organic Carbon (g oc/g soil)": 0.009,
    "Hydraulic Conductivity (m/day)": 0.1,
    "Soil Bulk Density (g/cm³)" : 1.64,
    "Longitudinal Dispersion (0 for code calculated)(m)": 0.0,
    "Transverse Dispersion (0 for code calculated)(m)": 0.0,
    "Vertical Dispersion (0 for code calculated)(m)": 0.0,
    "Thickness of Source Area (m)" : 1,
    "Length of Source Area (m)" : 10,
    "Width of Source Area (m)" : 10,
    "Receptor Distance Downgradient (m)" : 30,
    "Receptor Distance Crossgradient (m)" : 0,
    "Depth to Top of Well Screen (m)" : 0,
    "Depth to Bottom of Well Screen (m)" : 1,
    "No. of Points Used to Calculated Con. (Min : 2)" : 2
}

CHEMICAL_DEGRADATION = {
    "Benzene": 0.00096,
    "Toluene": 0.025,
    "Ethylbenzene": 0.003,
    "Xylenes": 0.00019,
}


class modelApp(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Model GUI")
        self.geometry("600x500")

        # Notebook for tabs
        self.notebook = ttk.Notebook(self)
        self.notebook.pack(fill="both", expand=True)

        # Tabs
        self.general_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.general_tab, text="General Settings")

        self.vadose_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.vadose_tab, text="Vadose Zone")
        self.notebook.tab(self.vadose_tab, state="disabled")  # Initially locked

        self.dissolved_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.dissolved_tab, text="Dissolved Source")
        self.notebook.tab(self.dissolved_tab, state="disabled")  # Initially locked

        self.saturated_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.saturated_tab, text="Saturated Zone")
        self.notebook.tab(self.saturated_tab, state="disabled")  # Initially locked

        self.output_tab = ttk.Frame(self.notebook)
        self.notebook.add(self.output_tab, text="Results")

        # Build each tab
        self.build_general_tab()
        self.build_dissolved_tab()
        self.build_vadose_tab()
        self.build_saturated_tab()
        self.build_output_tab()

    def build_general_tab(self):
        ttk.Label(self.general_tab, text="Chemical:").grid(row=0, column=0, padx=10, pady=10)
        self.chemical_var = tk.StringVar()
        chemical_dropdown = ttk.Combobox(self.general_tab, textvariable=self.chemical_var, width=50)
        chemical_dropdown["values"] = list(CHEMICAL_DEGRADATION.keys())
        chemical_dropdown.grid(row=0, column=1, padx=10, pady=10)
        chemical_dropdown.current(0)

        ttk.Label(self.general_tab, text="Choose Model:").grid(row=1, column=0, padx=10, pady=10)
        self.model_var = tk.StringVar()
        model_dropdown = ttk.Combobox(self.general_tab, textvariable=self.model_var, width=50)
        model_dropdown["values"] = [
            "Vadose Soil to Groundwater",
            "Saturated Soil to Groundwater",
            "Dissolved Source"
        ]
        model_dropdown.grid(row=1, column=1, padx=10, pady=10)
        model_dropdown.bind("<<ComboboxSelected>>", self.on_model_selected)

    def build_vadose_tab(self):
        self.vadose_params = {}
        row = 0
        for param, default in DEFAULT_VADOSE_PARAMS.items():
            ttk.Label(self.vadose_tab, text=f"{param}:").grid(row=row, column=0, padx=10, pady=5, sticky="w")
            var = tk.DoubleVar(value=default)
            entry = ttk.Entry(self.vadose_tab, textvariable=var, width=10)
            entry.grid(row=row, column=1, padx=10, pady=5)
            self.vadose_params[param] = var
            row += 1

    def build_saturated_tab(self):
        self.saturated_params = {}
        row = 0
        for param, default in DEFAULT_SATURATED_PARAMS.items():
            ttk.Label(self.saturated_tab, text=f"{param}:").grid(row=row, column=0, padx=10, pady=5, sticky="w")
            var = tk.DoubleVar(value=default)
            entry = ttk.Entry(self.saturated_tab, textvariable=var, width=10)
            entry.grid(row=row, column=1, padx=10, pady=5)
            self.saturated_params[param] = var
            row += 1

    def build_dissolved_tab(self):
        self.params = {}
        row = 0
        for param, default in DEFAULT_DISSOLVED_PARAMS.items():
            ttk.Label(self.dissolved_tab, text=f"{param}:").grid(row=row, column=0, padx=10, pady=5, sticky="w")
            var = tk.DoubleVar(value=default)
            entry = ttk.Entry(self.dissolved_tab, textvariable=var, width=10)
            entry.grid(row=row, column=1, padx=10, pady=5)
            self.params[param] = var
            row += 1

    def build_output_tab(self):
        self.output_text = tk.Text(self.output_tab, height=20, width=70)
        self.output_text.pack(padx=10, pady=10)

        calculate_button = ttk.Button(self.output_tab, text="Calculate", command=self.calculate)
        calculate_button.pack(side="left", padx=10, pady=10)

        export_button = ttk.Button(self.output_tab, text="Export to CSV", command=self.export_results)
        export_button.pack(side="left", padx=10, pady=10)

    def on_model_selected(self, event):
        model = self.model_var.get()
        if model == "Dissolved Source":
            self.notebook.tab(self.dissolved_tab, state="normal")
            self.notebook.tab(self.vadose_tab, state="disabled")
            self.notebook.tab(self.saturated_tab, state="disabled")
        elif model == "Vadose Soil to Groundwater":
            self.notebook.tab(self.dissolved_tab, state="disabled")
            self.notebook.tab(self.vadose_tab, state="normal")
            self.notebook.tab(self.saturated_tab, state="disabled")
        elif model == "Saturated Soil to Groundwater":
            self.notebook.tab(self.dissolved_tab, state="disabled")
            self.notebook.tab(self.vadose_tab, state="disabled")
            self.notebook.tab(self.saturated_tab, state="normal")

    def calculate(self):
        chemical = self.chemical_var.get()
        degradation_rate = CHEMICAL_DEGRADATION[chemical]
        results = f"Selected Chemical: {chemical}\nDegradation Rate: {degradation_rate} per day\n\nParameters:\n"
        for param, var in self.params.items():
            results += f"{param}: {var.get()}\n"
        self.output_text.delete(1.0, tk.END)
        self.output_text.insert(tk.END, results)

    def export_results(self):
        try:
            with open("risc_results.csv", "w") as f:
                f.write(self.output_text.get(1.0, tk.END))
            messagebox.showinfo("Success", "Results exported to 'risc_results.csv'")
        except Exception as e:
            messagebox.showerror("Error", f"Failed to export results: {e}")

if __name__ == "__main__":
    app = modelApp()
    app.mainloop()